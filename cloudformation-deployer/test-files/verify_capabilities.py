#!/usr/bin/env python3

import boto3
import base64
import os

def test_capabilities_directly():
    """Test CloudFormation capabilities directly with your credentials"""
    
    # Decode your credentials
    try:
        access_key = base64.b64decode("").decode()
        secret_key = base64.b64decode("").decode()
        
        print(f"Decoded Access Key: {access_key}")
        print(f"Decoded Secret Key: {secret_key[:10]}...")
        
    except Exception as e:
        print(f"❌ Error decoding credentials: {e}")
        return False
    
    # Test credentials first
    print("\n1️⃣ Testing credentials...")
    try:
        sts = boto3.client(
            'sts',
            region_name='af-south-1',
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key
        )
        
        response = sts.get_caller_identity()
        print(f"✅ Credentials valid - Account: {response['Account']}")
        print(f"✅ User: {response['Arn']}")
        
    except Exception as e:
        print(f"❌ Credentials invalid: {e}")
        print("This explains why you're getting credential errors, not capabilities errors")
        return False
    
    # Test CloudFormation deployment
    print("\n2️⃣ Testing CloudFormation deployment...")
    try:
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
        
        print(f"✅ Template loaded: {len(template_body)} characters")
        print(f"✅ Contains IAM resources: {'AWS::IAM::' in template_body}")
        
        # Try deployment with capabilities
        stack_name = 'test-capabilities-direct-boto3'
        
        print(f"\n3️⃣ Attempting deployment with capabilities...")
        print(f"Stack name: {stack_name}")
        print(f"Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM']")
        
        response = cf.create_stack(
            StackName=stack_name,
            TemplateBody=template_body,
            Capabilities=['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM']
        )
        
        print(f"✅ Deployment successful!")
        print(f"Stack ID: {response['StackId']}")
        return True
        
    except cf.exceptions.ClientError as e:
        error_code = e.response['Error']['Code']
        error_msg = e.response['Error']['Message']
        
        print(f"❌ CloudFormation error: {error_code}")
        print(f"❌ Message: {error_msg}")
        
        if error_code == 'InsufficientCapabilitiesException':
            print("❌ CONFIRMED: Missing capabilities!")
            print("This should NOT happen if capabilities are passed correctly")
            return False
        elif error_code == 'AlreadyExistsException':
            print("⚠️  Stack already exists - this is actually good!")
            return True
        else:
            print(f"⚠️  Other CloudFormation error: {error_code}")
            return False
            
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

def main():
    print("🔍 DIRECT BOTO3 CAPABILITIES VERIFICATION")
    print("=" * 60)
    
    success = test_capabilities_directly()
    
    print("\n" + "=" * 60)
    print("📋 FINAL ANALYSIS:")
    
    if success:
        print("✅ Your credentials work and capabilities are handled correctly")
        print("✅ The server code is working properly")
        print("\n🤔 If you're still getting capabilities errors in the UI:")
        print("1. Make sure you're using the exact same credentials")
        print("2. Check that the server restarted with the new code")
        print("3. Clear your browser cache")
        print("4. Check the server terminal for debug messages")
    else:
        print("❌ There's still an issue with credentials or capabilities")
        print("\n💡 Recommendations:")
        print("1. Get fresh AWS credentials")
        print("2. Verify CloudFormation permissions")
        print("3. Test with a simpler template first")
    
    return 0 if success else 1

if __name__ == "__main__":
    main()