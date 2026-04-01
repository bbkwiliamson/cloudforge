#!/usr/bin/env python3

import boto3
import base64
import os

# Decode credentials
access_key = base64.b64decode("").decode()
secret_key = base64.b64decode("").decode()

def test_direct_deployment():
    """Test CloudFormation deployment directly with boto3"""
    
    # Create CloudFormation client
    cf = boto3.client(
        'cloudformation',
        region_name='af-south-1',
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key
    )
    
    # Read template
    template_path = 'uploads/test-role.yml'
    if not os.path.exists(template_path):
        print(f"❌ Template not found: {template_path}")
        return False
    
    with open(template_path, 'r') as f:
        template_body = f.read()
    
    stack_name = 'test-role-stack-cloudforge'
    
    try:
        print("🧪 Testing deployment WITHOUT capabilities...")
        response = cf.create_stack(
            StackName=f"{stack_name}-no-caps",
            TemplateBody=template_body
        )
        print("❌ This shouldn't succeed!")
        
    except cf.exceptions.ClientError as e:
        if "InsufficientCapabilitiesException" in str(e):
            print("✅ Got expected capabilities error without capabilities")
        else:
            print(f"❌ Unexpected error: {e}")
    
    try:
        print("\n🧪 Testing deployment WITH capabilities...")
        response = cf.create_stack(
            StackName=stack_name,
            TemplateBody=template_body,
            Capabilities=['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM']
        )
        print(f"✅ Deployment successful! Stack ID: {response['StackId']}")
        return True
        
    except cf.exceptions.ClientError as e:
        if "InsufficientCapabilitiesException" in str(e):
            print("❌ Still getting capabilities error WITH capabilities!")
            print("This indicates a problem with the template or AWS permissions")
        elif "AlreadyExistsException" in str(e):
            print("⚠️  Stack already exists")
            return True
        else:
            print(f"❌ Deployment error: {e}")
        return False
    
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

def test_credentials():
    """Test AWS credentials"""
    try:
        sts = boto3.client(
            'sts',
            region_name='af-south-1',
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key
        )
        
        response = sts.get_caller_identity()
        print("✅ Credentials valid")
        print(f"   Account: {response['Account']}")
        print(f"   User: {response['Arn']}")
        return True
        
    except Exception as e:
        print(f"❌ Credential test failed: {e}")
        return False

def main():
    print("🧪 Direct boto3 CloudFormation Test\n")
    
    if not test_credentials():
        return 1
    
    print()
    if test_direct_deployment():
        print("\n✅ Direct deployment test completed!")
        return 0
    else:
        print("\n❌ Direct deployment test failed!")
        return 1

if __name__ == "__main__":
    main()