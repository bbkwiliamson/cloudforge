from flask import Blueprint, request, jsonify
import logging
from utils.aws_client import create_aws_client

logger = logging.getLogger(__name__)
service_catalog_bp = Blueprint('service_catalog', __name__)

@service_catalog_bp.route('/service-catalog/products', methods=['POST'])
def list_service_catalog_products():
    try:
        data = request.json
        region = data['region']
        account_id = data['accountId']
        
        sc = create_aws_client('servicecatalog', region, account_id)
        
        products = []
        next_token = None
        page_count = 0
        
        while True:
            page_count += 1
            if next_token:
                response = sc.search_products(PageSize=100, PageToken=next_token)
            else:
                response = sc.search_products(PageSize=100)
            
            page_products = response.get('ProductViewSummaries', [])
            logger.info(f"Service Catalog: Page {page_count} returned {len(page_products)} products")
            
            for p in page_products:
                products.append({
                    'id': p['ProductId'],
                    'name': p['Name'],
                    'description': p.get('ShortDescription', ''),
                    'owner': p.get('Owner', '')
                })
            
            next_token = response.get('NextPageToken')
            if not next_token:
                break
        
        logger.info(f"Service Catalog: Total products fetched: {len(products)}")
        return jsonify({'products': products})
    except Exception as e:
        logger.error(f"Service Catalog error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@service_catalog_bp.route('/service-catalog/product-versions', methods=['POST'])
def get_product_versions():
    try:
        data = request.json
        product_id = data['productId']
        region = data['region']
        account_id = data['accountId']
        
        sc = create_aws_client('servicecatalog', region, account_id)
        
        product_response = sc.describe_product(Id=product_id)
        
        provisioning_artifacts = product_response.get('ProvisioningArtifacts', [])
        if not provisioning_artifacts:
            return jsonify({'error': 'No versions found for this product'}), 404
        
        versions = [{
            'id': artifact['Id'],
            'name': artifact.get('Name', 'Unknown'),
            'description': artifact.get('Description', '')
        } for artifact in provisioning_artifacts]
        
        return jsonify({'versions': versions})
    except Exception as e:
        logger.error(f"Service Catalog versions error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@service_catalog_bp.route('/service-catalog/product-details', methods=['POST'])
def get_product_details():
    try:
        data = request.json
        product_id = data['productId']
        artifact_id = data['artifactId']
        region = data['region']
        account_id = data['accountId']
        
        sc = create_aws_client('servicecatalog', region, account_id)
        
        product_response = sc.describe_product(Id=product_id)
        
        launch_paths = product_response.get('LaunchPaths', [])
        if not launch_paths:
            return jsonify({'error': 'No launch paths found for this product'}), 404
        
        path_id = launch_paths[0]['Id']
        
        params_response = sc.describe_provisioning_parameters(
            ProductId=product_id,
            ProvisioningArtifactId=artifact_id,
            PathId=path_id
        )
        
        parameters = []
        for p in params_response.get('ProvisioningArtifactParameters', []):
            param = {
                'key': p['ParameterKey'],
                'description': p.get('Description', ''),
                'defaultValue': p.get('DefaultValue', ''),
                'type': p.get('ParameterType', 'String'),
                'isNoEcho': p.get('IsNoEcho', False)
            }
            
            constraints = p.get('ParameterConstraints', {})
            if 'AllowedValues' in constraints:
                param['allowedValues'] = constraints['AllowedValues']
            else:
                param_key_lower = p['ParameterKey'].lower()
                if 'vpc' in param_key_lower:
                    try:
                        ec2_client = create_aws_client('ec2', region, account_id)
                        vpc_response = ec2_client.describe_vpcs()
                        vpcs = [vpc['VpcId'] for vpc in vpc_response.get('Vpcs', [])]
                        param['allowedValues'] = vpcs
                    except Exception:
                        pass
                elif 'subnet' in param_key_lower:
                    try:
                        ec2_client = create_aws_client('ec2', region, account_id)
                        subnet_response = ec2_client.describe_subnets()
                        subnets = [subnet['SubnetId'] for subnet in subnet_response.get('Subnets', [])]
                        param['allowedValues'] = subnets
                    except Exception:
                        pass
            
            parameters.append(param)
        
        return jsonify({
            'productId': product_id,
            'artifactId': artifact_id,
            'parameters': parameters
        })
    except Exception as e:
        logger.error(f"Service Catalog product details error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@service_catalog_bp.route('/service-catalog/provision', methods=['POST'])
def provision_product():
    try:
        data = request.json
        product_id = data['productId']
        artifact_id = data['artifactId']
        parameters = data['parameters']
        provisioned_product_name = data['provisionedProductName']
        region = data['region']
        account_id = data['accountId']
        user_email = data.get('userEmail', 'unknown')
        rte_email = data.get('rteEmail')
        
        logger.info(f"AUDIT: Service Catalog provision initiated by {user_email} (RTE: {rte_email}) for product {product_id} in account {account_id}")
        
        sc = create_aws_client('servicecatalog', region, account_id)
        
        params = [{'Key': k, 'Value': v} for k, v in parameters.items()]
        tags = [{'Key': 'CloudForgeUI', 'Value': 'true'}]
        
        response = sc.provision_product(
            ProductId=product_id,
            ProvisioningArtifactId=artifact_id,
            ProvisionedProductName=provisioned_product_name,
            ProvisioningParameters=params,
            Tags=tags
        )
        
        record_id = response['RecordDetail']['RecordId']
        logger.info(f"AUDIT: Service Catalog provision successful - Record ID: {record_id}")
        
        return jsonify({'recordId': record_id})
    except Exception as e:
        logger.error(f"AUDIT: Service Catalog provision failed - Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@service_catalog_bp.route('/service-catalog/provision-status', methods=['POST'])
def get_provision_status():
    try:
        data = request.json
        record_id = data['recordId']
        region = data['region']
        account_id = data['accountId']
        
        sc = create_aws_client('servicecatalog', region, account_id)
        
        response = sc.describe_record(Id=record_id)
        record = response['RecordDetail']
        
        outputs = {}
        error_details = []
        
        if record['Status'] == 'SUCCEEDED':
            for output in record.get('RecordOutputs', []):
                outputs[output['OutputKey']] = output['OutputValue']
        elif record['Status'] in ['FAILED', 'ERROR']:
            for error in record.get('RecordErrors', []):
                error_details.append({
                    'code': error.get('Code', 'Unknown'),
                    'description': error.get('Description', 'No description available')
                })
        
        return jsonify({
            'status': record['Status'],
            'outputs': outputs,
            'provisionedProductId': record.get('ProvisionedProductId', ''),
            'errorDetails': error_details
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@service_catalog_bp.route('/service-catalog/terminate', methods=['POST'])
def terminate_provisioned_product():
    try:
        data = request.json
        provisioned_product_id = data['provisionedProductId']
        region = data['region']
        account_id = data['accountId']
        user_email = data.get('userEmail', 'unknown')
        rte_email = data.get('rteEmail')
        environment = data.get('environment', 'unknown')
        crq_id = data.get('crqId', '')
        
        logger.info(f"AUDIT: Service Catalog termination initiated by {user_email} (RTE: {rte_email}) for product {provisioned_product_id} in account {account_id} - Environment: {environment}, CRQ: {crq_id}")
        
        sc = create_aws_client('servicecatalog', region, account_id)
        
        response = sc.terminate_provisioned_product(
            ProvisionedProductId=provisioned_product_id
        )
        
        record_id = response['RecordDetail']['RecordId']
        logger.info(f"AUDIT: Service Catalog termination successful - Record ID: {record_id}")
        
        return jsonify({'recordId': record_id})
    except Exception as e:
        logger.error(f"AUDIT: Service Catalog termination failed - Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@service_catalog_bp.route('/service-catalog/product-resources', methods=['POST'])
def get_product_resources():
    try:
        data = request.json
        provisioned_product_id = data['provisionedProductId']
        region = data['region']
        account_id = data['accountId']
        
        sc = create_aws_client('servicecatalog', region, account_id)
        
        describe_response = sc.describe_provisioned_product(Id=provisioned_product_id)
        product_detail = describe_response.get('ProvisionedProductDetail', {})
        
        resources = []
        stack_identifier = None
        
        try:
            outputs_response = sc.get_provisioned_product_outputs(ProvisionedProductId=provisioned_product_id)
            outputs = outputs_response.get('Outputs', [])
            
            for output in outputs:
                output_key = output.get('OutputKey', '')
                output_value = output.get('OutputValue', '')
                
                if not stack_identifier and ('stack' in output_key.lower() or 'arn:aws:cloudformation' in output_value):
                    stack_identifier = output_value
                
                resources.append({
                    'logicalId': output_key,
                    'physicalId': output_value,
                    'type': 'Output',
                    'status': 'AVAILABLE',
                    'description': output.get('Description', '')
                })
        except Exception as outputs_error:
            logger.warning(f"Could not get outputs: {str(outputs_error)}")
        
        if not stack_identifier:
            stack_identifier = product_detail.get('PhysicalId')
        
        if stack_identifier:
            try:
                cf = create_aws_client('cloudformation', region, account_id)
                cf_response = cf.describe_stack_resources(StackName=stack_identifier)
                
                for resource in cf_response.get('StackResources', []):
                    resources.append({
                        'logicalId': resource['LogicalResourceId'],
                        'physicalId': resource.get('PhysicalResourceId', 'N/A'),
                        'type': resource['ResourceType'],
                        'status': resource['ResourceStatus'],
                        'description': ''
                    })
            except Exception as cf_error:
                logger.error(f"CF error: {str(cf_error)}")
        
        return jsonify({'resources': resources, 'stackId': stack_identifier or product_detail.get('Name', 'N/A')})
    except Exception as e:
        logger.error(f"Get product resources error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@service_catalog_bp.route('/service-catalog/product-parameters', methods=['POST'])
def get_product_parameters():
    try:
        data = request.json
        provisioned_product_id = data.get('provisionedProductId')
        region = data.get('region')
        account_id = data.get('accountId')
        
        sc = create_aws_client('servicecatalog', region, account_id)
        
        describe_response = sc.describe_provisioned_product(Id=provisioned_product_id)
        product_detail = describe_response.get('ProvisionedProductDetail', {})
        
        product_id = product_detail.get('ProductId')
        artifact_id = product_detail.get('ProvisioningArtifactId')
        provisioning_params = {}
        
        try:
            outputs_response = sc.get_provisioned_product_outputs(ProvisionedProductId=provisioned_product_id)
            outputs = outputs_response.get('Outputs', [])
            
            stack_id = None
            for output in outputs:
                output_value = output.get('OutputValue', '')
                if 'arn:aws:cloudformation' in output_value:
                    stack_id = output_value
                    break
            
            if not stack_id:
                stack_id = product_detail.get('PhysicalId')
            
            if stack_id:
                cf = create_aws_client('cloudformation', region, account_id)
                stack_response = cf.describe_stacks(StackName=stack_id)
                if stack_response.get('Stacks'):
                    stack = stack_response['Stacks'][0]
                    for param in stack.get('Parameters', []):
                        provisioning_params[param['ParameterKey']] = param['ParameterValue']
        except Exception as cf_error:
            logger.warning(f"Could not get CloudFormation parameters: {str(cf_error)}")
        
        return jsonify({
            'productId': product_id,
            'artifactId': artifact_id,
            'parameters': provisioning_params,
            'productName': product_detail.get('Name', '')
        })
    except Exception as e:
        logger.error(f"Get product parameters error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@service_catalog_bp.route('/service-catalog/provisioned-products', methods=['POST'])
def list_provisioned_products():
    try:
        data = request.json
        region = data['region']
        account_id = data['accountId']
        
        sc = create_aws_client('servicecatalog', region, account_id)
        
        products = []
        next_token = None
        
        while True:
            params = {'PageSize': 100}
            if next_token:
                params['PageToken'] = next_token
                
            response = sc.search_provisioned_products(**params)
            
            for p in response.get('ProvisionedProducts', []):
                try:
                    last_record_id = p.get('LastRecordId')
                    if last_record_id:
                        record_response = sc.describe_record(Id=last_record_id)
                        record_tags = record_response.get('RecordDetail', {}).get('RecordTags', [])
                        tags_dict = {tag['Key']: tag['Value'] for tag in record_tags}
                        
                        if tags_dict.get('CloudForgeUI') == 'true':
                            products.append({
                                'id': p['Id'],
                                'name': p['Name'],
                                'type': p['Type'],
                                'status': p['Status'],
                                'statusMessage': p.get('StatusMessage', ''),
                                'createdTime': p['CreatedTime'].isoformat() if 'CreatedTime' in p else '',
                                'lastRecordId': p.get('LastRecordId', ''),
                                'productId': p.get('ProductId', ''),
                                'provisioningArtifactId': p.get('ProvisioningArtifactId', '')
                            })
                except Exception as e:
                    logger.warning(f"Could not check tags for product {p.get('Name', 'unknown')}: {str(e)}")
                    continue
            
            next_token = response.get('NextPageToken')
            if not next_token:
                break
        
        return jsonify({'provisionedProducts': products})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
