from flask import Blueprint, request, jsonify
from utils.aws_client import create_aws_client, get_tag_value

aws_resources_bp = Blueprint('aws_resources', __name__)

@aws_resources_bp.route('/vpcs', methods=['POST'])
def get_vpcs():
    try:
        data = request.json
        region = data['region']
        access_key_id = data['accessKeyId']
        secret_access_key = data['secretAccessKey']
        
        ec2_client = create_aws_client('ec2', region, access_key_id, secret_access_key)
        
        response = ec2_client.describe_vpcs()
        vpcs = []
        
        for vpc in response.get('Vpcs', []):
            vpc_name = get_tag_value(vpc.get('Tags', []), 'Name')
            vpcs.append({
                'id': vpc['VpcId'],
                'name': vpc_name,
                'cidr': vpc['CidrBlock'],
                'state': vpc['State']
            })
        
        return jsonify({'vpcs': vpcs})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/vpc-details', methods=['POST'])
def get_vpc_details():
    try:
        data = request.json
        vpc_id = data['vpcId']
        region = data['region']
        access_key_id = data['accessKeyId']
        secret_access_key = data['secretAccessKey']
        
        ec2_client = create_aws_client('ec2', region, access_key_id, secret_access_key)
        
        # Get VPC details
        vpc_response = ec2_client.describe_vpcs(VpcIds=[vpc_id])
        vpc = vpc_response['Vpcs'][0]
        
        # Get route tables for this VPC
        rt_response = ec2_client.describe_route_tables(Filters=[{'Name': 'vpc-id', 'Values': [vpc_id]}])
        route_tables = [rt['RouteTableId'] for rt in rt_response['RouteTables']]
        
        # Get all CIDRs (primary + additional)
        cidrs = [vpc['CidrBlock']]
        if 'CidrBlockAssociationSet' in vpc:
            for assoc in vpc['CidrBlockAssociationSet']:
                if assoc['CidrBlockState']['State'] == 'associated' and assoc['CidrBlock'] not in cidrs:
                    cidrs.append(assoc['CidrBlock'])
        
        vpc_name = get_tag_value(vpc.get('Tags', []), 'Name')
        
        return jsonify({
            'vpcId': vpc_id,
            'vpcName': vpc_name,
            'cidrs': cidrs,
            'routeTables': route_tables
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/subnets', methods=['POST'])
def get_subnets():
    try:
        data = request.json
        vpc_id = data['vpcId']
        region = data['region']
        access_key_id = data['accessKeyId']
        secret_access_key = data['secretAccessKey']
        
        ec2_client = create_aws_client('ec2', region, access_key_id, secret_access_key)
        
        response = ec2_client.describe_subnets(Filters=[{'Name': 'vpc-id', 'Values': [vpc_id]}])
        subnets = []
        
        for subnet in response.get('Subnets', []):
            name_tag = get_tag_value(subnet.get('Tags', []), 'Name')
            subnets.append({
                'id': subnet['SubnetId'],
                'name': name_tag,
                'cidr': subnet['CidrBlock'],
                'az': subnet['AvailabilityZone'],
                'availableIps': subnet['AvailableIpAddressCount']
            })
        
        return jsonify({'subnets': subnets})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/check-sns-topic', methods=['POST'])
def check_sns_topic():
    try:
        data = request.json
        topic_name = data['topicName']
        region = data['region']
        access_key_id = data['accessKeyId']
        secret_access_key = data['secretAccessKey']
        
        sns_client = create_aws_client('sns', region, access_key_id, secret_access_key)
        
        # List all topics and check if the name exists
        paginator = sns_client.get_paginator('list_topics')
        for page in paginator.paginate():
            for topic in page.get('Topics', []):
                topic_arn = topic['TopicArn']
                existing_name = topic_arn.split(':')[-1]
                if existing_name == topic_name:
                    return jsonify({'exists': True})
        
        return jsonify({'exists': False})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/check-bucket-name', methods=['POST'])
def check_bucket_name():
    try:
        data = request.json
        bucket_name = data['bucketName']
        region = data['region']
        access_key_id = data['accessKeyId']
        secret_access_key = data['secretAccessKey']
        
        s3_client = create_aws_client('s3', region, access_key_id, secret_access_key)
        
        try:
            # Try to get bucket location - if it succeeds, bucket exists
            s3_client.get_bucket_location(Bucket=bucket_name)
            return jsonify({'available': False, 'reason': 'Bucket name already exists'})
        except s3_client.exceptions.NoSuchBucket:
            # Bucket doesn't exist, name is available
            return jsonify({'available': True})
        except Exception as e:
            error_code = getattr(e, 'response', {}).get('Error', {}).get('Code', '')
            if error_code == 'AccessDenied':
                # Bucket exists but we don't have access
                return jsonify({'available': False, 'reason': 'Bucket name already exists'})
            else:
                return jsonify({'available': False, 'reason': str(e)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/iam-roles', methods=['POST'])
def get_iam_roles():
    try:
        data = request.json
        region = data['region']
        access_key_id = data['accessKeyId']
        secret_access_key = data['secretAccessKey']
        
        iam_client = create_aws_client('iam', region, access_key_id, secret_access_key)
        
        roles = []
        paginator = iam_client.get_paginator('list_roles')
        
        for page in paginator.paginate():
            for role in page.get('Roles', []):
                roles.append({
                    'name': role['RoleName'],
                    'arn': role['Arn']
                })
        
        return jsonify({'roles': roles})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/lambda-layers', methods=['POST'])
def get_lambda_layers():
    try:
        data = request.json
        region = data['region']
        access_key_id = data['accessKeyId']
        secret_access_key = data['secretAccessKey']
        
        lambda_client = create_aws_client('lambda', region, access_key_id, secret_access_key)
        
        layers = []
        paginator = lambda_client.get_paginator('list_layers')
        
        for page in paginator.paginate():
            for layer in page.get('Layers', []):
                latest_version = layer.get('LatestMatchingVersion', {})
                layers.append({
                    'name': layer['LayerName'],
                    'arn': latest_version.get('LayerVersionArn', ''),
                    'version': latest_version.get('Version', 1)
                })
        
        return jsonify({'layers': layers})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/rds-instances', methods=['POST'])
def get_rds_instances():
    try:
        data = request.json
        region = data['region']
        access_key_id = data['accessKeyId']
        secret_access_key = data['secretAccessKey']
        
        rds_client = create_aws_client('rds', region, access_key_id, secret_access_key)
        
        instances = []
        paginator = rds_client.get_paginator('describe_db_instances')
        
        for page in paginator.paginate():
            for instance in page.get('DBInstances', []):
                instances.append({
                    'identifier': instance['DBInstanceIdentifier'],
                    'engine': instance['Engine'],
                    'status': instance['DBInstanceStatus']
                })
        
        return jsonify({'instances': instances})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/secrets-manager-secrets', methods=['POST'])
def get_secrets_manager_secrets():
    try:
        data = request.json
        region = data['region']
        access_key_id = data['accessKeyId']
        secret_access_key = data['secretAccessKey']
        
        secrets_client = create_aws_client('secretsmanager', region, access_key_id, secret_access_key)
        
        secrets = []
        paginator = secrets_client.get_paginator('list_secrets')
        
        for page in paginator.paginate():
            for secret in page.get('SecretList', []):
                secrets.append({
                    'name': secret['Name'],
                    'arn': secret['ARN'],
                    'description': secret.get('Description', '')
                })
        
        return jsonify({'secrets': secrets})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/iam-users', methods=['POST'])
def get_iam_users():
    try:
        data = request.json
        region = data['region']
        access_key_id = data['accessKeyId']
        secret_access_key = data['secretAccessKey']
        
        iam_client = create_aws_client('iam', region, access_key_id, secret_access_key)
        
        users = []
        paginator = iam_client.get_paginator('list_users')
        
        for page in paginator.paginate():
            for user in page.get('Users', []):
                users.append({
                    'userName': user['UserName'],
                    'arn': user['Arn'],
                    'createDate': user['CreateDate'].isoformat()
                })
        
        return jsonify({'users': users})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/iam-policies', methods=['POST'])
def get_iam_policies():
    try:
        data = request.json
        region = data['region']
        access_key_id = data['accessKeyId']
        secret_access_key = data['secretAccessKey']
        query = data.get('query', '').lower()
        
        iam_client = create_aws_client('iam', region, access_key_id, secret_access_key)
        
        policies = []
        
        # Get AWS managed policies
        paginator = iam_client.get_paginator('list_policies')
        for page in paginator.paginate(Scope='All', MaxItems=500):
            for policy in page.get('Policies', []):
                policy_name = policy['PolicyName']
                if query in policy_name.lower():
                    policies.append({
                        'policyName': policy_name,
                        'arn': policy['Arn'],
                        'description': policy.get('Description', ''),
                        'isAWSManaged': policy['Arn'].startswith('arn:aws:iam::aws:')
                    })
        
        # Sort: customer managed first, then AWS managed
        policies.sort(key=lambda x: (x['isAWSManaged'], x['policyName']))
        
        return jsonify({'policies': policies[:100]})  # Limit to 100 results
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/attach-user-policy', methods=['POST'])
def attach_user_policy():
    try:
        data = request.json
        user_name = data['userName']
        policy_arn = data['policyArn']
        region = data['region']
        access_key_id = data['accessKeyId']
        secret_access_key = data['secretAccessKey']
        user_email = data.get('userEmail', 'unknown')
        account_id = data.get('accountId', 'unknown')
        
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"AUDIT: IAM policy attachment initiated by {user_email} - User: {user_name}, Policy: {policy_arn}, Account: {account_id}")
        
        iam_client = create_aws_client('iam', region, access_key_id, secret_access_key)
        
        # Attach policy to user
        iam_client.attach_user_policy(
            UserName=user_name,
            PolicyArn=policy_arn
        )
        
        logger.info(f"AUDIT: IAM policy attachment successful by {user_email} - User: {user_name}, Policy: {policy_arn}, Account: {account_id}")
        
        return jsonify({
            'success': True,
            'message': f'Policy successfully attached to user {user_name}'
        })
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"AUDIT: IAM policy attachment failed by {user_email if 'user_email' in locals() else 'unknown'} - Error: {str(e)}")
        return jsonify({'error': str(e)}), 500