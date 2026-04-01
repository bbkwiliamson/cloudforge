#!/usr/bin/env python3

import json
import subprocess
import sys

def test_deploy_endpoint():
    """Test the deploy endpoint with mock data to see the exact request being made"""
    
    # Test payload
    payload = {
        "templatePath": "test-role.yml",
        "parameters": {},
        "stackName": "test-capabilities-stack",
        "region": "af-south-1",
        "accessKeyId": "MOCK_ACCESS_KEY_ID",
        "secretAccessKey": "MOCK_SECRET_ACCESS_KEY"
    }
    
    curl_cmd = [
        'curl', '-s', '-X', 'POST',
        'http://127.0.0.1:3000/deploy',
        '-H', 'Content-Type: application/json',
        '-d', json.dumps(payload)
    ]
    
    try:
        result = subprocess.run(curl_cmd, capture_output=True, text=True, timeout=30)
        response = json.loads(result.stdout)
        
        print("🧪 Deploy Endpoint Test Results:")
        print(f"Status: {'✅ Success' if result.returncode == 0 else '❌ Failed'}")
        print(f"Response: {response}")
        
        # Check if we get capabilities error (we shouldn't with mock creds)
        error_msg = response.get('error', '')
        if 'InsufficientCapabilitiesException' in error_msg:
            print("❌ PROBLEM: Still getting capabilities error!")
            print("This means capabilities aren't being passed correctly")
            return False
        elif 'InvalidClientTokenId' in error_msg or 'credentials' in error_msg.lower():
            print("✅ GOOD: Got expected auth error (not capabilities error)")
            print("This means capabilities are being passed correctly")
            return True
        else:
            print(f"⚠️  Unexpected error: {error_msg}")
            return False
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

def check_template_content():
    """Check if the test template actually contains IAM resources"""
    try:
        with open('uploads/test-role.yml', 'r') as f:
            content = f.read()
        
        has_iam = 'AWS::IAM::' in content
        print(f"🔍 Template Analysis:")
        print(f"File exists: ✅")
        print(f"Contains IAM resources: {'✅' if has_iam else '❌'}")
        
        if has_iam:
            print("IAM resources found:")
            for line in content.split('\n'):
                if 'AWS::IAM::' in line:
                    print(f"  - {line.strip()}")
        
        return has_iam
        
    except FileNotFoundError:
        print("❌ Template file not found: uploads/test-role.yml")
        return False
    except Exception as e:
        print(f"❌ Error reading template: {e}")
        return False

def test_simple_template():
    """Test with a template that doesn't require capabilities"""
    payload = {
        "templatePath": "simple-test.yml",
        "parameters": {"BucketName": "test-bucket-12345"},
        "stackName": "simple-test-stack",
        "region": "af-south-1",
        "accessKeyId": "MOCK_ACCESS_KEY_ID",
        "secretAccessKey": "MOCK_SECRET_ACCESS_KEY"
    }
    
    curl_cmd = [
        'curl', '-s', '-X', 'POST',
        'http://127.0.0.1:3000/deploy',
        '-H', 'Content-Type: application/json',
        '-d', json.dumps(payload)
    ]
    
    try:
        result = subprocess.run(curl_cmd, capture_output=True, text=True, timeout=30)
        response = json.loads(result.stdout)
        
        print("🧪 Simple Template Test Results:")
        print(f"Response: {response}")
        
        error_msg = response.get('error', '')
        if 'InsufficientCapabilitiesException' in error_msg:
            print("❌ PROBLEM: Getting capabilities error for non-IAM template!")
            return False
        elif 'InvalidClientTokenId' in error_msg:
            print("✅ GOOD: Got expected auth error for simple template")
            return True
        else:
            print(f"⚠️  Unexpected response: {error_msg}")
            return False
            
    except Exception as e:
        print(f"❌ Simple template test failed: {e}")
        return False

def main():
    print("🧪 Running Capabilities Error Diagnosis\n")
    
    tests = [
        ("Template Content Check", check_template_content),
        ("Deploy Endpoint Test", test_deploy_endpoint),
        ("Simple Template Test", test_simple_template)
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n{'='*50}")
        print(f"Running: {test_name}")
        print('='*50)
        result = test_func()
        results.append((test_name, result))
    
    print(f"\n{'='*50}")
    print("SUMMARY")
    print('='*50)
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name}: {status}")
    
    # Analysis
    print(f"\n{'='*50}")
    print("ANALYSIS")
    print('='*50)
    
    if all(result for _, result in results):
        print("✅ All tests passed - capabilities are working correctly")
        print("The issue might be with your actual AWS credentials")
    else:
        print("❌ Some tests failed - there's an issue with the capabilities implementation")

if __name__ == "__main__":
    main()