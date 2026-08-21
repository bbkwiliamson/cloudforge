import boto3
import os
import logging

logger = logging.getLogger(__name__)

ROLE_NAME = os.environ.get('CLOUDFORGE_ROLE_NAME', 'Bounded-Cloudforge-DevPortal-cross-Account')
#ROLE_NAME = os.environ.get('CLOUDFORGE_ROLE_NAME', 'Bounded-CloudForge-local')
def create_aws_client(service, region, account_id):
    """Create AWS client by assuming a role in the target account"""
    role_arn = f'arn:aws:iam::{account_id}:role/{ROLE_NAME}'
    
    sts = boto3.client('sts')
    assumed = sts.assume_role(
        RoleArn=role_arn,
        RoleSessionName='CloudForge-Session'
    )
    creds = assumed['Credentials']
    
    return boto3.client(
        service,
        region_name=region,
        aws_access_key_id=creds['AccessKeyId'],
        aws_secret_access_key=creds['SecretAccessKey'],
        aws_session_token=creds['SessionToken']
    )

def create_aws_client_with_keys(service, region, access_key, secret_key):
    """Create AWS client using explicit access key and secret key"""
    return boto3.client(
        service,
        region_name=region,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key
    )

def get_tag_value(tags, key):
    """Get tag value by key from AWS resource tags"""
    return next((tag['Value'] for tag in tags if tag['Key'] == key), '')
