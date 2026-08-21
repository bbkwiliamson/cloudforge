from flask import Blueprint, request, jsonify
from utils.aws_client import create_aws_client, get_tag_value

aws_resources_bp = Blueprint('aws_resources', __name__)

@aws_resources_bp.route('/vpcs', methods=['POST'])
def get_vpcs():
    try:
        data = request.json
        region = data['region']
        account_id = data['accountId']
        
        ec2_client = create_aws_client('ec2', region, account_id)
        
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
        account_id = data['accountId']
        
        ec2_client = create_aws_client('ec2', region, account_id)
        
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
        account_id = data['accountId']
        
        ec2_client = create_aws_client('ec2', region, account_id)
        
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
        account_id = data['accountId']
        
        sns_client = create_aws_client('sns', region, account_id)
        
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
        account_id = data['accountId']
        
        s3_client = create_aws_client('s3', region, account_id)
        
        try:
            s3_client.get_bucket_location(Bucket=bucket_name)
            return jsonify({'available': False, 'reason': 'Bucket name already exists'})
        except s3_client.exceptions.NoSuchBucket:
            return jsonify({'available': True})
        except Exception as e:
            error_code = getattr(e, 'response', {}).get('Error', {}).get('Code', '')
            if error_code == 'AccessDenied':
                return jsonify({'available': False, 'reason': 'Bucket name already exists'})
            else:
                return jsonify({'available': False, 'reason': str(e)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/check-layer-name', methods=['POST'])
def check_layer_name():
    try:
        data = request.json
        layer_name = data['layerName']
        region = data['region']
        account_id = data['accountId']
        
        lambda_client = create_aws_client('lambda', region, account_id)
        
        try:
            response = lambda_client.list_layer_versions(LayerName=layer_name, MaxItems=1)
            exists = len(response.get('LayerVersions', [])) > 0
            return jsonify({'exists': exists})
        except lambda_client.exceptions.ResourceNotFoundException:
            return jsonify({'exists': False})
        except Exception as e:
            error_code = getattr(e, 'response', {}).get('Error', {}).get('Code', '')
            if error_code == 'ResourceNotFoundException':
                return jsonify({'exists': False})
            return jsonify({'error': str(e)}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/iam-roles', methods=['POST'])
def get_iam_roles():
    try:
        data = request.json
        region = data['region']
        account_id = data['accountId']
        
        iam_client = create_aws_client('iam', region, account_id)
        
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
        account_id = data['accountId']
        
        lambda_client = create_aws_client('lambda', region, account_id)
        
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

@aws_resources_bp.route('/ec2-instances', methods=['POST'])
def get_ec2_instances():
    try:
        data = request.json
        region = data['region']
        account_id = data['accountId']
        
        ec2_client = create_aws_client('ec2', region, account_id)
        
        instances = []
        paginator = ec2_client.get_paginator('describe_instances')
        
        for page in paginator.paginate(Filters=[{'Name': 'instance-state-name', 'Values': ['running', 'stopped']}]):
            for reservation in page.get('Reservations', []):
                for instance in reservation.get('Instances', []):
                    name = get_tag_value(instance.get('Tags', []), 'Name')
                    instances.append({
                        'id': instance['InstanceId'],
                        'name': name,
                        'type': instance['InstanceType'],
                        'state': instance['State']['Name']
                    })
        
        return jsonify({'instances': instances})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/rds-instances', methods=['POST'])
def get_rds_instances():
    try:
        data = request.json
        region = data['region']
        account_id = data['accountId']
        
        rds_client = create_aws_client('rds', region, account_id)
        
        instances = []
        paginator = rds_client.get_paginator('describe_db_instances')
        
        for page in paginator.paginate():
            for db in page.get('DBInstances', []):
                instances.append({
                    'identifier': db['DBInstanceIdentifier'],
                    'engine': db['Engine'],
                    'status': db['DBInstanceStatus']
                })
        
        return jsonify({'instances': instances})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/secrets-manager-secrets', methods=['POST'])
def get_secrets():
    try:
        data = request.json
        region = data['region']
        account_id = data['accountId']
        
        sm_client = create_aws_client('secretsmanager', region, account_id)
        
        secrets = []
        paginator = sm_client.get_paginator('list_secrets')
        
        for page in paginator.paginate():
            for secret in page.get('SecretList', []):
                secrets.append({
                    'name': secret['Name'],
                    'description': secret.get('Description', '')
                })
        
        return jsonify({'secrets': secrets})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/prefix-lists', methods=['POST'])
def get_prefix_lists():
    try:
        data = request.json
        region = data['region']
        account_id = data['accountId']

        ec2_client = create_aws_client('ec2', region, account_id)

        prefix_lists = []
        paginator = ec2_client.get_paginator('describe_managed_prefix_lists')

        for page in paginator.paginate():
            for pl in page.get('PrefixLists', []):
                prefix_lists.append({
                    'id': pl['PrefixListId'],
                    'name': pl['PrefixListName'],
                    'arn': pl['PrefixListArn'],
                    'state': pl['State']
                })

        return jsonify({'prefixLists': prefix_lists})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/iam-users', methods=['POST'])
def get_iam_users():
    try:
        data = request.json
        region = data['region']
        account_id = data['accountId']
        
        iam_client = create_aws_client('iam', region, account_id)
        
        users = []
        paginator = iam_client.get_paginator('list_users')
        
        for page in paginator.paginate():
            for user in page.get('Users', []):
                users.append({
                    'userName': user['UserName'],
                    'arn': user['Arn'],
                    'createDate': user['CreateDate'].isoformat() if 'CreateDate' in user else None
                })
        
        return jsonify({'users': users})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/iam-policies', methods=['POST'])
def get_iam_policies():
    try:
        data = request.json
        region = data['region']
        account_id = data['accountId']
        
        iam_client = create_aws_client('iam', region, account_id)
        
        policies = []
        
        # Get customer managed policies
        paginator = iam_client.get_paginator('list_policies')
        for page in paginator.paginate(Scope='Local'):
            for policy in page.get('Policies', []):
                policies.append({
                    'policyName': policy['PolicyName'],
                    'arn': policy['Arn'],
                    'description': policy.get('Description', ''),
                    'isAWSManaged': False
                })
        
        # Get AWS managed policies (limited to commonly used ones)
        for page in paginator.paginate(Scope='AWS', MaxItems=100):
            for policy in page.get('Policies', []):
                policies.append({
                    'policyName': policy['PolicyName'],
                    'arn': policy['Arn'],
                    'description': policy.get('Description', ''),
                    'isAWSManaged': True
                })
        
        return jsonify({'policies': policies})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@aws_resources_bp.route('/attach-user-policy', methods=['POST'])
def attach_user_policy():
    try:
        data = request.json
        user_name = data['userName']
        policy_arn = data['policyArn']
        region = data['region']
        account_id = data['accountId']
        user_email = data.get('userEmail', 'unknown')
        
        iam_client = create_aws_client('iam', region, account_id)
        
        # Attach the policy to the user
        iam_client.attach_user_policy(
            UserName=user_name,
            PolicyArn=policy_arn
        )
        
        return jsonify({
            'success': True,
            'message': f'Policy {policy_arn} successfully attached to user {user_name}'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
