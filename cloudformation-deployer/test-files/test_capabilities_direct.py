#!/usr/bin/env python3

import json
import subprocess

def test_deploy_endpoint_verbose():
    """Test deploy endpoint and show exactly what's being sent"""
    
    # Use your base64 encoded credentials as they appear in the UI
    payload = {
        "templatePath": "test-role.yml",
        "parameters": {},
        "stackName": "test-capabilities-stack-direct",
        "region": "af-south-1",
        "accessKeyId": "",
        "secretAccessKey": ""
    }
    
    print("🧪 Testing Deploy Endpoint with Verbose Output")
    print("=" * 60)
    print(f"Payload being sent:")
    print(f"  Stack Name: {payload['stackName']}")
    print(f"  Template: {payload['templatePath']}")
    print(f"  Region: {payload['region']}")
    print(f"  Access Key (B64): {payload['accessKeyId'][:10]}...")
    print(f"  Secret Key (B64): {payload['secretAccessKey'][:10]}...")
    
    # Make the request with verbose curl output
    curl_cmd = [
        'curl', '-v', '-X', 'POST',
        'http://127.0.0.1:3000/deploy',
        '-H', 'Content-Type: application/json',
        '-d', json.dumps(payload)
    ]
    
    print(f"\n📡 Making request to /deploy endpoint...")
    
    try:
        result = subprocess.run(curl_cmd, capture_output=True, text=True, timeout=60)
        
        print(f"\n📥 Response Status: {result.returncode}")
        print(f"📥 Response Body: {result.stdout}")
        
        if result.stderr:
            print(f"📥 Curl Debug Info: {result.stderr}")
        
        # Parse response
        try:
            response = json.loads(result.stdout)
            error_msg = response.get('error', '')
            
            print(f"\n🔍 Analysis:")
            if 'InsufficientCapabilitiesException' in error_msg:
                print("❌ CONFIRMED: Getting InsufficientCapabilitiesException")
                print("❌ This means capabilities are NOT being passed to CloudFormation")
                
                if 'CAPABILITY_NAMED_IAM' in error_msg:
                    print("❌ Specifically missing: CAPABILITY_NAMED_IAM")
                
                print("\n🔧 This indicates the server code is NOT working as expected")
                return False
                
            elif 'InvalidClientTokenId' in error_msg:
                print("✅ Getting credential error (not capabilities error)")
                print("✅ This means capabilities ARE being passed correctly")
                return True
                
            elif 'stackId' in response:
                print("✅ Deployment successful!")
                return True
                
            else:
                print(f"⚠️  Other error: {error_msg}")
                return False
                
        except json.JSONDecodeError:
            print(f"❌ Invalid JSON response: {result.stdout}")
            return False
            
    except subprocess.TimeoutExpired:
        print("❌ Request timed out")
        return False
    except Exception as e:
        print(f"❌ Request failed: {e}")
        return False

def check_server_debug_output():
    """Check if server is outputting debug messages"""
    print("\n🔍 Checking for server debug output...")
    print("Look for these debug messages in your server terminal:")
    print("  - DEBUG: Creating stack ... with capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM']")
    print("  - DEBUG: Template contains IAM resources: True")
    print("\nIf you don't see these messages, the server code isn't being executed.")

def main():
    print("🔍 DIRECT CAPABILITIES TEST")
    print("=" * 60)
    
    success = test_deploy_endpoint_verbose()
    check_server_debug_output()
    
    print("\n" + "=" * 60)
    print("📋 SUMMARY:")
    
    if success:
        print("✅ Capabilities are working correctly in the server")
        print("🔧 The issue is likely with your AWS credentials")
        print("\n💡 Next steps:")
        print("1. Verify your AWS credentials are correct")
        print("2. Check if the credentials have CloudFormation permissions")
        print("3. Try with different/fresh credentials")
    else:
        print("❌ Capabilities are NOT working in the server")
        print("🔧 The server is not passing capabilities to CloudFormation")
        print("\n💡 Next steps:")
        print("1. Check if the server restarted with the new code")
        print("2. Verify the debug messages appear in server output")
        print("3. Check if there are multiple server instances running")
    
    return 0 if success else 1

if __name__ == "__main__":
    main()