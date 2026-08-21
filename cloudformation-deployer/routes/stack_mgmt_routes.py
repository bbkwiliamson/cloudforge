from flask import Blueprint, request, jsonify
import json
import logging
import base64
import boto3
from utils.aws_client import create_aws_client, create_aws_client_with_keys
from routes.auth_routes import ALLOWED_USERS_SECRET

stack_mgmt_bp = Blueprint('stack_mgmt', __name__)
logger = logging.getLogger(__name__)

@stack_mgmt_bp.route('/test-credentials', methods=['POST'])
def test_credentials():
    try:
        data = request.json
        region = data['region']
        user_email = data.get('userEmail', '').strip().lower()
        credentials_b64 = data.get('credentials')  # present only in direct-keys mode

        if not user_email:
            return jsonify({'error': 'User email is required for authorization'}), 403

        if credentials_b64:
            # --- Direct keys mode: keys are the proof of access, no allowed-users check ---
            try:
                decoded = base64.b64decode(credentials_b64).decode('utf-8')
                access_key, secret_key = decoded.split(':', 1)
            except Exception:
                return jsonify({'error': 'Invalid credentials format. Must be base64 encoded ACCESS_KEY:SECRET_KEY'}), 400

            sts_client = create_aws_client_with_keys('sts', region, access_key, secret_key)
            response = sts_client.get_caller_identity()
            account_id = response['Account']

            logger.info(f"AUDIT: {user_email} authorized via direct keys to account {account_id}")
            return jsonify({'account': account_id, 'user': response['Arn']})

        else:
            # --- Role assumption mode (existing flow) ---
            account_id = data.get('accountId')
            if not account_id:
                return jsonify({'error': 'accountId is required'}), 400

            sts_client = create_aws_client('sts', region, account_id)
            response = sts_client.get_caller_identity()

            try:
                sm_client = create_aws_client('secretsmanager', region, account_id)
                secret_response = sm_client.get_secret_value(SecretId=ALLOWED_USERS_SECRET)
                secret_data = json.loads(secret_response['SecretString'])
                allowed_users = [u.lower() for u in secret_data.get('allowedUsers', [])]

                if user_email not in allowed_users:
                    logger.warning(f"AUDIT: Unauthorized access attempt by {user_email} to account {account_id}")
                    return jsonify({'error': f'You ({user_email}) are not authorized to deploy to account {account_id}'}), 403
            except Exception as secret_error:
                error_msg = str(secret_error)
                if 'ResourceNotFoundException' in error_msg or 'AccessDeniedException' in error_msg:
                    logger.warning(f"AUDIT: No allowed-users secret found in account {account_id}, blocking {user_email}")
                    return jsonify({'error': f'Account {account_id} has not been configured for CloudForge access'}), 403
                raise

            logger.info(f"AUDIT: {user_email} authorized and connected to account {account_id}")
            return jsonify({'account': response['Account'], 'user': response['Arn']})

    except Exception as e:
        return jsonify({'error': str(e)}), 400

@stack_mgmt_bp.route('/search-stack', methods=['POST'])
def search_stack():
    try:
        data = request.json
        stack_name = data['stackName']
        region = data['region']
        account_id = data['accountId']
        
        cf = create_aws_client('cloudformation', region, account_id)
        
        response = cf.describe_stacks(StackName=stack_name)
        stack = response['Stacks'][0]
        
        existing_params = {}
        if 'Parameters' in stack:
            for param in stack['Parameters']:
                existing_params[param['ParameterKey']] = param['ParameterValue']
        
        return jsonify({
            'stackName': stack_name,
            'stackStatus': stack['StackStatus'],
            'parameters': existing_params
        })
    except Exception as e:
        if 'does not exist' in str(e):
            return jsonify({'error': f'Stack "{stack_name}" not found'}), 404
        return jsonify({'error': str(e)}), 400

@stack_mgmt_bp.route('/stack-details', methods=['POST'])
def get_stack_details():
    try:
        data = request.json
        stack_name = data['stackName']
        region = data['region']
        account_id = data['accountId']
        
        cf = create_aws_client('cloudformation', region, account_id)
        
        stack_response = cf.describe_stacks(StackName=stack_name)
        stack = stack_response['Stacks'][0]
        
        resources_response = cf.describe_stack_resources(StackName=stack_name)
        resources = resources_response['StackResources']
        
        services = {}
        for resource in resources:
            resource_type = resource['ResourceType']
            service = resource_type.split('::')[1] if '::' in resource_type else 'Other'
            if service not in services:
                services[service] = 0
            services[service] += 1
        
        return jsonify({
            'stackName': stack['StackName'],
            'creationTime': stack['CreationTime'].isoformat(),
            'lastUpdatedTime': stack.get('LastUpdatedTime', stack['CreationTime']).isoformat(),
            'resourceCount': len(resources),
            'services': services
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@stack_mgmt_bp.route('/check-stack-status', methods=['POST'])
def check_stack_status():
    try:
        data = request.json
        stack_name = data['stackName']
        region = data['region']
        account_id = data['accountId']
        
        cf = create_aws_client('cloudformation', region, account_id)
        
        response = cf.describe_stacks(StackName=stack_name)
        stack = response['Stacks'][0]
        
        status = stack['StackStatus']
        status_reason = stack.get('StackStatusReason', '')
        
        failed_states = [
            'CREATE_FAILED', 'UPDATE_FAILED', 'DELETE_FAILED',
            'ROLLBACK_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE',
            'ROLLBACK_FAILED', 'UPDATE_ROLLBACK_FAILED'
        ]
        
        events = []
        if status in failed_states:
            try:
                events_response = cf.describe_stack_events(StackName=stack_name)
                
                for event in events_response.get('StackEvents', []):
                    event_status = event.get('ResourceStatus', '')
                    
                    if 'FAILED' in event_status:
                        events.append({
                            'timestamp': event['Timestamp'].isoformat(),
                            'resourceType': event.get('ResourceType', 'Stack'),
                            'logicalResourceId': event.get('LogicalResourceId', stack_name),
                            'resourceStatus': event_status,
                            'resourceStatusReason': event.get('ResourceStatusReason', 'No reason provided')
                        })
                        
                        if len(events) >= 15:
                            break
                            
            except Exception as events_error:
                logger.error(f"Could not fetch stack events: {str(events_error)}")
        
        if status_reason and status_reason not in [e.get('resourceStatusReason') for e in events]:
            events.insert(0, {
                'timestamp': '',
                'resourceType': 'Stack',
                'logicalResourceId': stack_name,
                'resourceStatus': status,
                'resourceStatusReason': status_reason
            })
        
        return jsonify({
            'status': status,
            'statusReason': status_reason,
            'isFailed': status in failed_states,
            'isComplete': status.endswith('_COMPLETE'),
            'isInProgress': status.endswith('_IN_PROGRESS'),
            'failedEvents': events if events else []
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@stack_mgmt_bp.route('/continue-update-rollback', methods=['POST'])
def continue_update_rollback():
    try:
        data = request.json
        stack_name = data['stackName']
        region = data['region']
        account_id = data['accountId']
        skip_resources = data.get('skipResources', [])
        user_email = data.get('userEmail', 'unknown')
        
        logger.info(f"AUDIT: Continue update rollback initiated by {user_email} for stack {stack_name} in account {account_id}")
        
        cf = create_aws_client('cloudformation', region, account_id)
        
        params = {'StackName': stack_name}
        if skip_resources and skip_resources != ['*']:
            valid_resources = [r for r in skip_resources if r != '*' and r.strip()]
            if valid_resources:
                params['ResourcesToSkip'] = valid_resources
            
        cf.continue_update_rollback(**params)
        
        logger.info(f"AUDIT: Continue update rollback successful by {user_email} for stack {stack_name} in account {account_id}")
        return jsonify({'message': f'Continue update rollback initiated for stack {stack_name}'})
    except Exception as e:
        logger.error(f"AUDIT: Continue update rollback failed - Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@stack_mgmt_bp.route('/get-failed-resources', methods=['POST'])
def get_failed_resources():
    try:
        data = request.json
        stack_name = data['stackName']
        region = data['region']
        account_id = data['accountId']
        
        cf = create_aws_client('cloudformation', region, account_id)
        
        response = cf.describe_stack_resources(StackName=stack_name)
        
        failed_resources = []
        for resource in response.get('StackResources', []):
            status = resource.get('ResourceStatus', '')
            if 'FAILED' in status or 'ROLLBACK_FAILED' in status:
                failed_resources.append({
                    'logicalId': resource['LogicalResourceId'],
                    'physicalId': resource.get('PhysicalResourceId', 'N/A'),
                    'type': resource['ResourceType'],
                    'status': status,
                    'statusReason': resource.get('ResourceStatusReason', '')
                })
        
        return jsonify({'failedResources': failed_resources})
    except Exception as e:
        logger.error(f"Get failed resources error: {str(e)}")
        return jsonify({'error': str(e)}), 500
