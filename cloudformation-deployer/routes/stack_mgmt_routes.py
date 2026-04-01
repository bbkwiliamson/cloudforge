from flask import Blueprint, request, jsonify
import boto3
import logging

stack_mgmt_bp = Blueprint('stack_mgmt', __name__)
logger = logging.getLogger(__name__)

@stack_mgmt_bp.route('/test-credentials', methods=['POST'])
def test_credentials():
    try:
        data = request.json
        region = data['region']
        access_key_id = data['accessKeyId'].strip()
        secret_access_key = data['secretAccessKey'].strip()
        
        sts = boto3.client(
            'sts',
            region_name=region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key
        )
        
        response = sts.get_caller_identity()
        
        return jsonify({
            'account': response['Account'],
            'user': response['Arn']
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@stack_mgmt_bp.route('/search-stack', methods=['POST'])
def search_stack():
    try:
        data = request.json
        stack_name = data['stackName']
        region = data['region']
        access_key_id = data['accessKeyId'].strip()
        secret_access_key = data['secretAccessKey'].strip()
        
        cf = boto3.client(
            'cloudformation',
            region_name=region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key
        )
        
        # Get stack details
        response = cf.describe_stacks(StackName=stack_name)
        stack = response['Stacks'][0]
        
        # Extract parameters from existing stack
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
        access_key_id = data['accessKeyId'].strip()
        secret_access_key = data['secretAccessKey'].strip()
        
        cf = boto3.client(
            'cloudformation',
            region_name=region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key
        )
        
        # Get stack details
        stack_response = cf.describe_stacks(StackName=stack_name)
        stack = stack_response['Stacks'][0]
        
        # Get stack resources
        resources_response = cf.describe_stack_resources(StackName=stack_name)
        resources = resources_response['StackResources']
        
        # Group resources by service
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
        access_key_id = data['accessKeyId'].strip()
        secret_access_key = data['secretAccessKey'].strip()
        
        cf = boto3.client(
            'cloudformation',
            region_name=region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key
        )
        
        response = cf.describe_stacks(StackName=stack_name)
        stack = response['Stacks'][0]
        
        status = stack['StackStatus']
        status_reason = stack.get('StackStatusReason', '')
        
        # Check if stack is in a failed state
        failed_states = [
            'CREATE_FAILED', 'UPDATE_FAILED', 'DELETE_FAILED',
            'ROLLBACK_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE',
            'ROLLBACK_FAILED', 'UPDATE_ROLLBACK_FAILED'
        ]
        
        # Get stack events to find detailed error information
        events = []
        if status in failed_states:
            try:
                events_response = cf.describe_stack_events(StackName=stack_name)
                
                # Get all events and filter for failures
                for event in events_response.get('StackEvents', []):
                    event_status = event.get('ResourceStatus', '')
                    
                    # Include any event with FAILED in the status
                    if 'FAILED' in event_status:
                        events.append({
                            'timestamp': event['Timestamp'].isoformat(),
                            'resourceType': event.get('ResourceType', 'Stack'),
                            'logicalResourceId': event.get('LogicalResourceId', stack_name),
                            'resourceStatus': event_status,
                            'resourceStatusReason': event.get('ResourceStatusReason', 'No reason provided')
                        })
                        
                        # Limit to 15 most recent failures
                        if len(events) >= 15:
                            break
                            
            except Exception as events_error:
                logger.error(f"Could not fetch stack events: {str(events_error)}")
        
        # Always add stack-level reason if available (even if we found events)
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
        access_key_id = data['accessKeyId'].strip()
        secret_access_key = data['secretAccessKey'].strip()
        skip_resources = data.get('skipResources', [])
        user_email = data.get('userEmail', 'unknown')
        account_id = data.get('accountId', 'unknown')
        
        logger.info(f"AUDIT: Continue update rollback initiated by {user_email} for stack {stack_name} in account {account_id}")
        
        cf = boto3.client(
            'cloudformation',
            region_name=region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key
        )
        
        # Continue update rollback
        params = {'StackName': stack_name}
        if skip_resources and skip_resources != ['*']:
            # Filter out invalid patterns like '*'
            valid_resources = [r for r in skip_resources if r != '*' and r.strip()]
            if valid_resources:
                params['ResourcesToSkip'] = valid_resources
            
        cf.continue_update_rollback(**params)
        
        logger.info(f"AUDIT: Continue update rollback successful by {user_email} for stack {stack_name} in account {account_id}")
        return jsonify({'message': f'Continue update rollback initiated for stack {stack_name}'})
    except Exception as e:
        logger.error(f"AUDIT: Continue update rollback failed by {user_email} for stack {stack_name} in account {account_id} - Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@stack_mgmt_bp.route('/get-failed-resources', methods=['POST'])
def get_failed_resources():
    try:
        data = request.json
        stack_name = data['stackName']
        region = data['region']
        access_key_id = data['accessKeyId'].strip()
        secret_access_key = data['secretAccessKey'].strip()
        
        cf = boto3.client(
            'cloudformation',
            region_name=region,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key
        )
        
        # Get stack resources
        response = cf.describe_stack_resources(StackName=stack_name)
        
        failed_resources = []
        for resource in response.get('StackResources', []):
            status = resource.get('ResourceStatus', '')
            # Include resources that failed during rollback
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