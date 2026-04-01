import boto3

def create_aws_client(service, region, access_key_id, secret_access_key):
    """Create AWS client with credentials"""
    return boto3.client(
        service,
        region_name=region,
        aws_access_key_id=access_key_id.strip(),
        aws_secret_access_key=secret_access_key.strip()
    )

def get_tag_value(tags, key):
    """Get tag value by key from AWS resource tags"""
    return next((tag['Value'] for tag in tags if tag['Key'] == key), '')
