from flask import Blueprint, request, jsonify
import yaml
import json
import os
import logging
from datetime import datetime
from itsm_integration import ITSMIntegration
from utils.aws_client import create_aws_client
from utils.guard_validator import validate_template as run_guard_validation
from routes.prefix_list_routes import patch_prefix_list_template

deployment_bp = Blueprint('deployment', __name__)
logger = logging.getLogger(__name__)

# Custom YAML loader for CloudFormation templates
class CFLoader(yaml.SafeLoader):
    pass

def construct_cf_function(loader, tag_suffix, node):
    if isinstance(node, yaml.ScalarNode):
        return {tag_suffix: loader.construct_scalar(node)}
    elif isinstance(node, yaml.SequenceNode):
        return {tag_suffix: loader.construct_sequence(node)}
    elif isinstance(node, yaml.MappingNode):
        return {tag_suffix: loader.construct_mapping(node)}
    else:
        return {tag_suffix: None}

for tag in ['!Ref', '!GetAtt', '!Join', '!Sub', '!Select', '!Split', '!Base64', '!GetAZs', '!ImportValue', '!FindInMap', '!Condition', '!If', '!Not', '!Equals', '!And', '!Or']:
    CFLoader.add_multi_constructor(tag, construct_cf_function)

def construct_transform(loader, node):
    return loader.construct_scalar(node)

CFLoader.add_constructor('tag:yaml.org,2002:str', construct_transform)

TEMPLATES_BUCKET = os.environ.get('TEMPLATES_BUCKET', 'cloudforge-templates-bucket')
GUARD_RULES_KEY = os.environ.get('GUARD_RULES_KEY', 'guard-rules/cloudforge-guard-rules.yaml')

def _run_guard_check(template_body, template_path):
    """Run guard validation and return HIGH findings or None"""
    try:
        import boto3
        s3 = boto3.client('s3', region_name=os.environ.get('AWS_DEFAULT_REGION', 'af-south-1'))
        if template_body:
            try:
                template = yaml.load(template_body, Loader=CFLoader)
            except yaml.YAMLError:
                template = json.loads(template_body)
        elif template_path:
            response = s3.get_object(Bucket=TEMPLATES_BUCKET, Key=template_path)
            content = response['Body'].read().decode('utf-8')
            try:
                template = yaml.load(content, Loader=CFLoader)
            except yaml.YAMLError:
                template = json.loads(content)
        else:
            return None

        rules_response = s3.get_object(Bucket=TEMPLATES_BUCKET, Key=GUARD_RULES_KEY)
        rules = yaml.safe_load(rules_response['Body'].read().decode('utf-8')).get('rules', [])
        findings = run_guard_validation(template, rules)
        high_findings = [f for f in findings if f['severity'] == 'HIGH']
        return high_findings if high_findings else None
    except Exception as e:
        logger.warning(f"Guard validation skipped: {str(e)}")
        return None

def merge_parameters_with_overrides(existing_params, new_template_params, overrides=None):
    """Merge existing stack parameters with new template, applying overrides"""
    if overrides is None:
        overrides = {}
    
    for param_key in new_template_params.keys():
        if param_key.lower() in ['createdby', 'creator']:
            overrides[param_key] = 'CloudForge-API'
    
    merged_params = existing_params.copy()
    
    for key, value in overrides.items():
        if key in new_template_params:
            merged_params[key] = value
            logger.info(f"Override applied: {key} = {value}")
    
    return merged_params

@deployment_bp.route('/deploy', methods=['POST'])
def deploy():
    try:
        data = request.json
        template_body = data.get('templateBody')
        template_path = data.get('templatePath')
        parameters = data['parameters']
        stack_name = data['stackName']
        region = data['region']
        account_id = data['accountId']
        user_email = data.get('userEmail', 'unknown')
        rte_email = data.get('rteEmail')
        environment = data.get('environment', 'unknown')
        
        audit_info = f"Environment: {environment}"
        logger.info(f"AUDIT: Stack deployment initiated by {user_email} for stack {stack_name} in region {region} account {account_id} - {audit_info}")
        
        # Guard validation before deployment
        guard_findings = _run_guard_check(template_body, template_path)
        if guard_findings:
            return jsonify({'error': f'Deployment blocked: {len(guard_findings)} HIGH severity guard rule violation(s)', 'guardFindings': guard_findings}), 403
        
        # Create ITSM Change Request for PROD deployments
        change_id = None
        if environment == 'PROD':
            try:
                itsm = ITSMIntegration()
                if not itsm._authenticated:
                    itsm.authenticate()
                
                deployment_data = {
                    'stack_name': stack_name,
                    'account_id': account_id,
                    'region': region,
                    'environment': environment,
                    'template_path': template_path or 'custom-upload',
                    'user_email': user_email,
                    'rte_email': rte_email,
                    'deployment_type': 'CREATE'
                }
                change_id = itsm.create_change_request(deployment_data)
                if change_id:
                    logger.info(f"ITSM Change Request created: {change_id} for stack {stack_name}")
                    audit_info += f", ITSM CR: {change_id}"
            except Exception as itsm_error:
                logger.error(f"ITSM Change Request creation failed: {str(itsm_error)}")
        
        cf = create_aws_client('cloudformation', region, account_id)
        
        # Use template body if provided (custom upload), otherwise fetch from S3
        if template_body:
            pass
        elif template_path:
            try:
                import boto3
                s3 = boto3.client('s3', region_name=os.environ.get('AWS_DEFAULT_REGION', 'af-south-1'))
                s3_response = s3.get_object(Bucket=TEMPLATES_BUCKET, Key=template_path)
                template_body = s3_response['Body'].read().decode('utf-8')
            except Exception as s3_err:
                logger.error(f"Error fetching template from S3: {str(s3_err)}")
                return jsonify({'error': f'Failed to fetch template from S3: {str(s3_err)}'}), 400
        else:
            return jsonify({'error': 'No template provided'}), 400
        
        # Parse template to enforce CreatedBy override
        try:
            template = yaml.load(template_body, Loader=CFLoader)
        except yaml.YAMLError:
            try:
                template = json.loads(template_body)
            except json.JSONDecodeError:
                return jsonify({'error': 'Invalid template format'}), 400
        
        template_params = template.get('Parameters', {})
        
        final_params = parameters.copy()
        for param_key in template_params.keys():
            if param_key.lower() in ['createdby', 'creator']:
                final_params[param_key] = 'CloudForge-API'
                logger.info(f"Enforced override for new deployment: {param_key} = CloudForge-API")
        
        params = [{'ParameterKey': k, 'ParameterValue': v} for k, v in final_params.items()]
        
        response = cf.create_stack(
            StackName=stack_name,
            TemplateBody=template_body,
            Parameters=params,
            Capabilities=['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'],
            EnableTerminationProtection=True
        )
        
        logger.info(f"AUDIT: Stack deployment successful by {user_email} in account {account_id} - Stack ID: {response['StackId']}, {audit_info}")
        
        if change_id:
            try:
                itsm = ITSMIntegration()
                success_notes = f"CloudFormation stack {stack_name} deployed successfully. Stack ID: {response['StackId']}"
                itsm.update_change_status(change_id, 'Implemented', success_notes)
                itsm.add_work_log(change_id, f"Deployment completed successfully at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            except Exception as itsm_error:
                logger.error(f"ITSM update failed for Change Request {change_id}: {str(itsm_error)}")
        
        return jsonify({'stackId': response['StackId'], 'changeId': change_id})
    except Exception as e:
        logger.error(f"AUDIT: Stack deployment failed by {user_email} in account {account_id} - Error: {str(e)}")
        
        if 'change_id' in locals() and change_id:
            try:
                itsm = ITSMIntegration()
                failure_notes = f"CloudFormation stack {stack_name} deployment failed. Error: {str(e)}"
                itsm.update_change_status(change_id, 'Failed', failure_notes)
                itsm.add_work_log(change_id, f"Deployment failed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}: {str(e)}")
            except Exception as itsm_error:
                logger.error(f"ITSM update failed for Change Request {change_id}: {str(itsm_error)}")
        
        return jsonify({'error': str(e)}), 500

@deployment_bp.route('/update-stack', methods=['POST'])
def update_stack():
    try:
        data = request.json
        template_body = data.get('templateBody')
        template_path = data.get('templatePath')
        parameters = data['parameters']
        stack_name = data['stackName']
        region = data['region']
        account_id = data['accountId']
        user_email = data.get('userEmail', 'unknown')
        rte_email = data.get('rteEmail')
        environment = data.get('environment', 'unknown')
        
        audit_info = f"Environment: {environment}"
        logger.info(f"AUDIT: Stack update initiated by {user_email} for stack {stack_name} in region {region} account {account_id} - {audit_info}")
        
        # Guard validation before update
        guard_findings = _run_guard_check(template_body, template_path)
        if guard_findings:
            return jsonify({'error': f'Update blocked: {len(guard_findings)} HIGH severity guard rule violation(s)', 'guardFindings': guard_findings}), 403
        
        # Create ITSM Change Request for PROD updates
        change_id = None
        if environment == 'PROD':
            try:
                itsm = ITSMIntegration()
                if not itsm._authenticated:
                    itsm.authenticate()
                
                deployment_data = {
                    'stack_name': stack_name,
                    'account_id': account_id,
                    'region': region,
                    'environment': environment,
                    'template_path': template_path or 'custom-upload',
                    'user_email': user_email,
                    'rte_email': rte_email,
                    'deployment_type': 'UPDATE'
                }
                change_id = itsm.create_change_request(deployment_data)
                if change_id:
                    logger.info(f"ITSM Change Request created: {change_id} for stack update {stack_name}")
                    audit_info += f", ITSM CR: {change_id}"
            except Exception as itsm_error:
                logger.error(f"ITSM Change Request creation failed: {str(itsm_error)}")
        
        cf = create_aws_client('cloudformation', region, account_id)
        
        if template_body:
            pass
        elif template_path:
            try:
                import boto3
                s3 = boto3.client('s3', region_name=os.environ.get('AWS_DEFAULT_REGION', 'af-south-1'))
                s3_response = s3.get_object(Bucket=TEMPLATES_BUCKET, Key=template_path)
                template_body = s3_response['Body'].read().decode('utf-8')
            except Exception as s3_err:
                logger.error(f"Error fetching template from S3: {str(s3_err)}")
                return jsonify({'error': f'Failed to fetch template from S3: {str(s3_err)}'}), 400
        else:
            return jsonify({'error': 'No template provided'}), 400
        
        # Patch prefix list entries if applicable
        allowed_cidrs = parameters.get('AllowedCidrs', '')
        if allowed_cidrs:
            template_body = patch_prefix_list_template(template_body, allowed_cidrs)

        # Parse template to get parameter definitions
        try:
            template = yaml.load(template_body, Loader=CFLoader)
        except yaml.YAMLError:
            try:
                template = json.loads(template_body)
            except json.JSONDecodeError:
                return jsonify({'error': 'Invalid template format'}), 400
        
        new_template_params = template.get('Parameters', {})
        
        # Get existing stack parameters for comparison
        try:
            existing_stack = cf.describe_stacks(StackName=stack_name)
            existing_params = {}
            if existing_stack.get('Stacks'):
                stack = existing_stack['Stacks'][0]
                for param in stack.get('Parameters', []):
                    existing_params[param['ParameterKey']] = param['ParameterValue']
            
            merged_params = merge_parameters_with_overrides(existing_params, new_template_params)
            merged_params.update(parameters)
            
            for param_key in new_template_params.keys():
                if param_key.lower() in ['createdby', 'creator']:
                    merged_params[param_key] = 'CloudForge-API'
                    logger.info(f"Enforced override: {param_key} = CloudForge-API")
            
        except Exception as param_error:
            logger.warning(f"Could not retrieve existing parameters: {str(param_error)}")
            merged_params = parameters.copy()
            for param_key in new_template_params.keys():
                if param_key.lower() in ['createdby', 'creator']:
                    merged_params[param_key] = 'CloudForge-API'
        
        # Filter to only parameters that exist in the new template
        params = [
            {'ParameterKey': k, 'ParameterValue': v}
            for k, v in merged_params.items()
            if k in new_template_params
        ]
        
        response = cf.update_stack(
            StackName=stack_name,
            TemplateBody=template_body,
            Parameters=params,
            Capabilities=['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND']
        )
        
        # Enable termination protection if not already enabled
        try:
            stack_info = cf.describe_stacks(StackName=stack_name)['Stacks'][0]
            if not stack_info.get('EnableTerminationProtection', False):
                cf.update_termination_protection(
                    StackName=stack_name,
                    EnableTerminationProtection=True
                )
                logger.info(f"AUDIT: Termination protection enabled for stack {stack_name} by {user_email}")
        except Exception as e:
            logger.warning(f"Failed to enable termination protection for {stack_name}: {str(e)}")
        
        logger.info(f"AUDIT: Stack update successful by {user_email} in account {account_id} - Stack ID: {response['StackId']}, {audit_info}")
        
        if change_id:
            try:
                itsm = ITSMIntegration()
                success_notes = f"CloudFormation stack {stack_name} updated successfully. Stack ID: {response['StackId']}"
                itsm.update_change_status(change_id, 'Implemented', success_notes)
                itsm.add_work_log(change_id, f"Stack update completed successfully at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            except Exception as itsm_error:
                logger.error(f"ITSM update failed for Change Request {change_id}: {str(itsm_error)}")
        
        return jsonify({'stackId': response['StackId'], 'changeId': change_id})
    except Exception as e:
        logger.error(f"AUDIT: Stack update failed by {user_email} in account {account_id} - Error: {str(e)}")
        
        if 'ROLLBACK_COMPLETE state and can not be updated' in str(e) or 'UPDATE_ROLLBACK_FAILED state and can not be updated' in str(e):
            return jsonify({
                'error': str(e),
                'requiresRollback': True,
                'stackName': stack_name
            }), 400
        
        if 'No updates are to be performed' in str(e):
            return jsonify({'error': 'No changes detected in the template or parameters'}), 400
        return jsonify({'error': str(e)}), 400

@deployment_bp.route('/delete-stack', methods=['POST'])
def delete_stack():
    try:
        data = request.json
        stack_name = data['stackName']
        region = data['region']
        account_id = data['accountId']
        user_email = data.get('userEmail', 'unknown')
        rte_email = data.get('rteEmail')
        environment = data.get('environment', 'unknown')
        
        audit_info = f"Environment: {environment}"
        logger.info(f"AUDIT: Stack deletion initiated by {user_email} for stack {stack_name} in region {region} account {account_id} - {audit_info}")
        
        # Create ITSM Change Request for PROD deletions
        change_id = None
        if environment == 'PROD':
            try:
                itsm = ITSMIntegration()
                if not itsm._authenticated:
                    itsm.authenticate()
                
                deployment_data = {
                    'stack_name': stack_name,
                    'account_id': account_id,
                    'region': region,
                    'environment': environment,
                    'template_path': '',
                    'user_email': user_email,
                    'rte_email': rte_email,
                    'deployment_type': 'DELETE'
                }
                change_id = itsm.create_change_request(deployment_data)
                if change_id:
                    logger.info(f"ITSM Change Request created: {change_id} for stack deletion {stack_name}")
                    audit_info += f", ITSM CR: {change_id}"
            except Exception as itsm_error:
                logger.error(f"ITSM Change Request creation failed: {str(itsm_error)}")
        
        cf = create_aws_client('cloudformation', region, account_id)
        
        # Disable termination protection first
        cf.update_termination_protection(
            StackName=stack_name,
            EnableTerminationProtection=False
        )
        
        cf.delete_stack(StackName=stack_name)
        
        logger.info(f"AUDIT: Stack deletion successful by {user_email} in account {account_id} - Stack: {stack_name}, {audit_info}")
        
        if change_id:
            try:
                itsm = ITSMIntegration()
                success_notes = f"CloudFormation stack {stack_name} deletion initiated successfully."
                itsm.update_change_status(change_id, 'Implemented', success_notes)
                itsm.add_work_log(change_id, f"Stack deletion completed successfully at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            except Exception as itsm_error:
                logger.error(f"ITSM update failed for Change Request {change_id}: {str(itsm_error)}")
        
        return jsonify({'message': f'Stack {stack_name} deletion initiated', 'changeId': change_id})
    except Exception as e:
        logger.error(f"AUDIT: Stack deletion failed by {user_email} in account {account_id} - Error: {str(e)}")
        
        if 'change_id' in locals() and change_id:
            try:
                itsm = ITSMIntegration()
                failure_notes = f"CloudFormation stack {stack_name} deletion failed. Error: {str(e)}"
                itsm.update_change_status(change_id, 'Failed', failure_notes)
                itsm.add_work_log(change_id, f"Deletion failed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}: {str(e)}")
            except Exception as itsm_error:
                logger.error(f"ITSM update failed for Change Request {change_id}: {str(itsm_error)}")
        
        return jsonify({'error': str(e)}), 500

@deployment_bp.route('/create-crq-for-environment', methods=['POST'])
def create_crq_for_environment():
    """Create CRQ when PROD environment is selected, before actual deployment"""
    try:
        data = request.json
        stack_name = data.get('stackName', 'TBD')
        account_id = data.get('accountId', 'unknown')
        region = data.get('region', 'unknown')
        environment = data.get('environment', 'unknown')
        user_email = data.get('userEmail', 'unknown')
        rte_email = data.get('rteEmail')
        operation_type = data.get('operationType', 'DEPLOY')
        template_path = data.get('templatePath', '')
        
        if environment != 'PROD':
            return jsonify({'changeId': None})
        
        try:
            itsm = ITSMIntegration()
            if not itsm._authenticated:
                itsm.authenticate()
            
            deployment_data = {
                'stack_name': stack_name,
                'account_id': account_id,
                'region': region,
                'environment': environment,
                'template_path': template_path,
                'user_email': user_email,
                'rte_email': rte_email,
                'deployment_type': operation_type
            }
            
            change_id = itsm.create_change_request(deployment_data)
            
            if change_id:
                logger.info(f"Pre-created ITSM Change Request: {change_id} for {operation_type} operation on stack {stack_name}")
                return jsonify({'changeId': change_id})
            else:
                return jsonify({'error': 'Failed to create Change Request'}), 500
                
        except Exception as itsm_error:
            logger.error(f"ITSM Change Request creation failed: {str(itsm_error)}")
            return jsonify({'error': f'CRQ creation failed: {str(itsm_error)}'}), 500
            
    except Exception as e:
        logger.error(f"Create CRQ for environment error: {str(e)}")
        return jsonify({'error': str(e)}), 500
