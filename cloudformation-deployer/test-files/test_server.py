#!/usr/bin/env python3
"""
Comprehensive test script for the refactored CloudForge server
Tests all modules, routes, and critical functionality
"""

import sys
import os
import importlib.util
import traceback
from unittest.mock import Mock, patch, MagicMock

def test_imports():
    """Test that all modules can be imported without errors"""
    print("=== TESTING IMPORTS ===")
    
    # Test main server import
    try:
        sys.path.insert(0, '.')
        import server
        print("✅ Main server.py imports successfully")
    except Exception as e:
        print(f"❌ Main server.py import failed: {e}")
        return False
    
    # Test individual modules
    modules = [
        'routes.aws_resources_routes',
        'routes.cloudformation_routes', 
        'routes.service_catalog_routes',
        'routes.deployment_routes',
        'routes.template_routes',
        'routes.auth_routes',
        'routes.itsm_routes',
        'routes.stack_mgmt_routes',
        'utils.aws_client'
    ]
    
    for module in modules:
        try:
            importlib.import_module(module)
            print(f"✅ {module} imports successfully")
        except Exception as e:
            print(f"❌ {module} import failed: {e}")
            return False
    
    return True

def test_blueprint_registration():
    """Test that all blueprints are properly registered"""
    print("\n=== TESTING BLUEPRINT REGISTRATION ===")
    
    try:
        import server
        app = server.app
        
        # Check registered blueprints
        blueprint_names = [bp.name for bp in app.blueprints.values()]
        expected_blueprints = [
            'aws_resources', 'cloudformation', 'service_catalog',
            'deployment', 'template', 'auth', 'itsm', 'stack_mgmt'
        ]
        
        for bp_name in expected_blueprints:
            if bp_name in blueprint_names:
                print(f"✅ Blueprint '{bp_name}' registered")
            else:
                print(f"❌ Blueprint '{bp_name}' NOT registered")
                return False
        
        return True
    except Exception as e:
        print(f"❌ Blueprint registration test failed: {e}")
        return False

def test_route_availability():
    """Test that all expected routes are available"""
    print("\n=== TESTING ROUTE AVAILABILITY ===")
    
    try:
        import server
        app = server.app
        
        # Get all registered routes
        routes = []
        for rule in app.url_map.iter_rules():
            routes.append(rule.rule)
        
        # Expected critical routes
        critical_routes = [
            '/health',
            '/',
            '/auth/login',
            '/test-credentials',
            '/deploy',
            '/update-stack',
            '/delete-stack',
            '/vpcs',
            '/subnets',
            '/service-catalog/products',
            '/itsm/query-change',
            '/parse-template',
            '/load-template'
        ]
        
        for route in critical_routes:
            if route in routes:
                print(f"✅ Route '{route}' available")
            else:
                print(f"❌ Route '{route}' NOT available")
                return False
        
        print(f"✅ Total routes registered: {len(routes)}")
        return True
    except Exception as e:
        print(f"❌ Route availability test failed: {e}")
        return False

def test_health_endpoint():
    """Test the health endpoint functionality"""
    print("\n=== TESTING HEALTH ENDPOINT ===")
    
    try:
        import server
        app = server.app
        
        with app.test_client() as client:
            # Mock IP to bypass VPN check for health endpoint
            with patch('server.request') as mock_request:
                mock_request.remote_addr = '127.0.0.1'
                mock_request.headers = {'X-Forwarded-For': '127.0.0.1'}
                mock_request.endpoint = 'health_check'
                
                response = client.get('/health')
                
                if response.status_code == 200:
                    data = response.get_json()
                    if data.get('status') == 'healthy':
                        print("✅ Health endpoint working correctly")
                        return True
                    else:
                        print(f"❌ Health endpoint returned wrong data: {data}")
                        return False
                else:
                    print(f"❌ Health endpoint returned status {response.status_code}")
                    return False
    except Exception as e:
        print(f"❌ Health endpoint test failed: {e}")
        traceback.print_exc()
        return False

def test_aws_client_utility():
    """Test the AWS client utility functions"""
    print("\n=== TESTING AWS CLIENT UTILITY ===")
    
    try:
        from utils.aws_client import create_aws_client, get_tag_value
        
        # Test get_tag_value function
        tags = [
            {'Key': 'Name', 'Value': 'test-vpc'},
            {'Key': 'Environment', 'Value': 'dev'}
        ]
        
        name_value = get_tag_value(tags, 'Name')
        if name_value == 'test-vpc':
            print("✅ get_tag_value function working")
        else:
            print(f"❌ get_tag_value returned: {name_value}")
            return False
        
        # Test create_aws_client function (mock boto3)
        with patch('utils.aws_client.boto3') as mock_boto3:
            mock_client = Mock()
            mock_boto3.client.return_value = mock_client
            
            client = create_aws_client('ec2', 'us-east-1', 'test-key', 'test-secret')
            
            if client == mock_client:
                print("✅ create_aws_client function working")
                return True
            else:
                print("❌ create_aws_client function failed")
                return False
                
    except Exception as e:
        print(f"❌ AWS client utility test failed: {e}")
        return False

def test_itsm_integration():
    """Test ITSM integration is properly initialized"""
    print("\n=== TESTING ITSM INTEGRATION ===")
    
    try:
        import server
        
        # Check if ITSM is initialized
        if hasattr(server, 'itsm'):
            print("✅ ITSM integration initialized")
            return True
        else:
            print("❌ ITSM integration not found")
            return False
            
    except Exception as e:
        print(f"❌ ITSM integration test failed: {e}")
        return False

def test_configuration():
    """Test server configuration"""
    print("\n=== TESTING CONFIGURATION ===")
    
    try:
        import server
        app = server.app
        
        # Check upload folder configuration
        if app.config.get('UPLOAD_FOLDER') == 'uploads':
            print("✅ Upload folder configured correctly")
        else:
            print(f"❌ Upload folder config wrong: {app.config.get('UPLOAD_FOLDER')}")
            return False
        
        # Check VPN IP ranges
        if hasattr(server, 'ALLOWED_IP_RANGES') and len(server.ALLOWED_IP_RANGES) == 5:
            print("✅ VPN IP ranges configured")
        else:
            print("❌ VPN IP ranges not configured properly")
            return False
        
        return True
    except Exception as e:
        print(f"❌ Configuration test failed: {e}")
        return False

def test_yaml_loader():
    """Test CloudFormation YAML loader functionality"""
    print("\n=== TESTING YAML LOADER ===")
    
    try:
        # Test in deployment routes
        from routes.deployment_routes import CFLoader
        import yaml
        
        # Test YAML with CloudFormation functions
        test_yaml = """
        AWSTemplateFormatVersion: '2010-09-09'
        Resources:
          TestResource:
            Type: AWS::S3::Bucket
            Properties:
              BucketName: !Ref BucketNameParam
        """
        
        parsed = yaml.load(test_yaml, Loader=CFLoader)
        if parsed and 'Resources' in parsed:
            print("✅ CloudFormation YAML loader working")
            return True
        else:
            print("❌ CloudFormation YAML loader failed")
            return False
            
    except Exception as e:
        print(f"❌ YAML loader test failed: {e}")
        return False

def run_all_tests():
    """Run all tests and return overall result"""
    print("🧪 STARTING COMPREHENSIVE SERVER TESTS\n")
    
    tests = [
        test_imports,
        test_blueprint_registration,
        test_route_availability,
        test_health_endpoint,
        test_aws_client_utility,
        test_itsm_integration,
        test_configuration,
        test_yaml_loader
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        try:
            if test():
                passed += 1
            else:
                print(f"❌ {test.__name__} FAILED")
        except Exception as e:
            print(f"❌ {test.__name__} CRASHED: {e}")
    
    print(f"\n=== TEST RESULTS ===")
    print(f"Passed: {passed}/{total}")
    print(f"Success Rate: {(passed/total)*100:.1f}%")
    
    if passed == total:
        print("🎉 ALL TESTS PASSED - SERVER IS WORKING CORRECTLY!")
        return True
    else:
        print("⚠️  SOME TESTS FAILED - CHECK ISSUES ABOVE")
        return False

if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)