import requests
import json
import logging
from datetime import datetime, timedelta
import base64
import os
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

class ITSMIntegration:
    def __init__(self):
        self.base_url = "https://itsmweb.{}bank.co.za:{port}/baocdp/rest"
        self.session = requests.Session()
        self.session.verify = True  # SSL verification
        self._authenticated = False
        self.auth_token = None
        
    def _get_itsm_credentials(self):
        """Get ITSM credentials from Secrets Manager or environment variables"""
        try:
            # Try Secrets Manager first (works both locally and in production)
            secrets_client = boto3.client('secretsmanager')
            secret_response = secrets_client.get_secret_value(SecretId='cloudforge/secrets/itsm-service-accounts')
            secret_data = json.loads(secret_response['SecretString'])
            logger.info("Using ITSM credentials from Secrets Manager")
            return secret_data['username'], secret_data['password']
        except (ClientError, KeyError, json.JSONDecodeError) as e:
            logger.warning(f"Could not retrieve from Secrets Manager: {str(e)}")
            # Fallback to environment variables (for local development)
            username = os.getenv('ITSM_USERNAME')
            password = os.getenv('ITSM_PASSWORD')
            if username and password:
                logger.info("Using ITSM credentials from environment variables")
                return username, password
            else:
                logger.error("No ITSM credentials found in Secrets Manager or environment variables")
                raise Exception("ITSM credentials not available")
        
    def authenticate(self, username=None, password=None):
        """Authenticate with ITSM using API credentials"""
        try:
            # Get credentials if not provided
            if not username or not password:
                username, password = self._get_itsm_credentials()
                
            logger.info(f"Attempting ITSM authentication for {username}...")
            auth_url = f"{self.base_url}/login"
            
            auth_data = {
                'username': username,
                'password': password
            }
            
            response = self.session.post(auth_url, json=auth_data, timeout=30)
            logger.info(f"ITSM response status: {response.status_code}")
            
            if response.status_code == 200 and 'Authentication-Token' in response.headers:
                self.auth_token = response.headers['Authentication-Token']
                self._authenticated = True
                logger.info(f"✓ ITSM authentication successful for {username}")
                return True
            else:
                logger.error(f"✗ ITSM authentication failed - status: {response.status_code}")
                self._authenticated = False
                self.auth_token = None
                return False
                
        except Exception as e:
            logger.error(f"✗ ITSM authentication error for {username}: {str(e)} - PROD deployments will fail")
            self._authenticated = False
            self.auth_token = None
            return False
    
    def create_change_request(self, deployment_data):
        """Create LOW RISK change request for CloudFormation deployment"""
        try:
            logger.info(f"Starting ITSM Change Request creation for {deployment_data['stack_name']}")
            
            if not hasattr(self, '_authenticated') or not self._authenticated:
                logger.error("ITSM authentication not available - cannot create change request")
                raise Exception("ITSM Change Request creation failed: Authentication not available")
            
            # Calculate timestamps (Unix epoch format)
            start_time = int(datetime.now().timestamp())
            end_time = int((datetime.now() + timedelta(hours=2)).timestamp())
            
            # Build request body using actual ITSM API structure
            request_body = {
                "inputParameters": [
                    {
                        "name": "INP_Summary",
                        "value": f"CloudForge AWS Automated Change - {deployment_data['stack_name'][:64]}"
                    },
                    {
                        "name": "INP_Notes",
                        "value": f"CloudForge User Initiated CloudFormation operational changes for {deployment_data['stack_name']} in {deployment_data.get('environment', 'Unknown')} environment"
                    },
                    {
                        "name": "INP_ChangeCoordinatorLogin",
                        "value": deployment_data.get('rte_email', deployment_data['user_email'])
                    },
                    {
                        "name": "INP_TemplateID",
                        "value": "IDGAAFGYAUWVJATJMQQHTIKTNDC360"
                    },
                    {
                        "name": "INP_StartDate",
                        "value": str(start_time)
                    },
                    {
                        "name": "INP_EndDate",
                        "value": str(end_time)
                    },
                    {
                        "name": "INP_WorkInfo",
                        "value": f"PPB Digital Platforms CRQ - {deployment_data['stack_name'][:40]} - CloudFormation deployment"
                    },
                    {
                        "name": "INP_RequesterLoginID",
                        "value": deployment_data.get('rte_email', deployment_data['user_email'])
                    },
                    {
                        "name": "INP_Environment",
                        "value": "Production" if deployment_data.get('environment') == 'PROD' else deployment_data.get('environment', 'Production')
                    }
                ]
            }
            
            # Make API call to create change request
            create_url = "https://itsmweb.{}bank.co.za:{port}/baocdp/rest/process/:SBSA-OA-Generic_ITSM_Interface:ChangeManagement:CreateChange/execute"
            
            headers = {
                'Content-Type': 'application/json',
                'Authentication-Token': self.auth_token
            }
            
            response = self.session.post(create_url, json=request_body, headers=headers, timeout=30)
            
            if response.status_code == 200:
                try:
                    response_data = response.json()
                    logger.info(f"ITSM API Response: {json.dumps(response_data, indent=2)}")
                    
                    # Extract CRQ number - response_data is directly a list
                    change_number = None
                    
                    if isinstance(response_data, list):
                        for param in response_data:
                            if isinstance(param, dict) and param.get('name') == 'OUT_ChangeNumber':
                                value = param.get('value', '')
                                # Check if the value contains an error
                                if '<status>error</status>' in value:
                                    logger.error(f"ITSM API returned error: {value}")
                                    raise Exception("ITSM Change Request creation failed: Invalid Environment value")
                                else:
                                    change_number = value
                                    break
                    
                    if change_number:
                        logger.info(f"ITSM Change Request created: {change_number}")
                        return change_number
                    else:
                        logger.error(f"ITSM Change Request created but no CRQ number found in response")
                        raise Exception("ITSM Change Request creation failed: No CRQ number in response")
                        
                except json.JSONDecodeError as je:
                    logger.error(f"ITSM API returned invalid JSON: {response.text}")
                    raise Exception(f"ITSM API response parsing failed: {str(je)}")
            else:
                logger.error(f"ITSM Change Request creation failed: {response.status_code} - {response.text}")
                raise Exception(f"ITSM Change Request creation failed: HTTP {response.status_code}")
                
        except Exception as e:
            logger.error(f"ITSM Change Request creation error: {str(e)}", exc_info=True)
            raise
    
    def update_work_info(self, change_id, work_info_type, attachment_data=None, attachment_name=None):
        """Update ITSM Change Request with work information and attachments"""
        try:
            if not hasattr(self, '_authenticated') or not self._authenticated:
                logger.error("ITSM authentication not available - cannot update change request")
                raise Exception("ITSM Work Update failed: Authentication not available")
            
            logger.info(f"Starting ITSM Work Update for CRQ {change_id}")
            logger.info(f"Work Info Type: {work_info_type}")
            logger.info(f"Attachment Name: {attachment_name}")
            logger.info(f"Attachment Data Length: {len(attachment_data) if attachment_data else 0}")
            
            # Build request body for work update
            request_body = {
                "inputParameters": [
                    {
                        "name": "INP_ChangeNumber",
                        "value": change_id
                    },
                    {
                        "name": "INP_WorkInfoSummary",
                        "value": "CloudForge deployment update"
                    },
                    {
                        "name": "INP_WorkInfoNotes",
                        "value": "CloudForge deployment update"
                    },
                    {
                        "name": "INP_SystemName",
                        "value": "ITSM Remedy"
                    },
                    {
                        "name": "INP_WorkInfoType",
                        "value": work_info_type
                    }
                ]
            }
            
            # Add attachment if provided
            if attachment_data and attachment_name:
                logger.info(f"Adding attachment to request: {attachment_name}")
                request_body["inputParameters"].extend([
                    {
                        "name": "INP_AttachmentData",
                        "value": attachment_data
                    },
                    {
                        "name": "INP_AttachmentName",
                        "value": attachment_name
                    }
                ])
            else:
                logger.warning("No attachment data provided")
            
            logger.info(f"Request body parameters count: {len(request_body['inputParameters'])}")
            
            # Make API call to update work info
            update_url = "https://itsmweb.{}bank.co.za:{port}/baocdp/rest/process/:SBSA-OA-Generic_ITSM_Interface:ChangeManagement:WorkUpdate/execute?mode=sync"
            
            headers = {
                'Content-Type': 'application/json',
                'Authentication-Token': self.auth_token
            }
            
            logger.info(f"Sending request to ITSM API: {update_url}")
            response = self.session.post(update_url, json=request_body, headers=headers, timeout=30)
            
            logger.info(f"ITSM API Response Status: {response.status_code}")
            logger.info(f"ITSM API Response Body: {response.text}")
            
            if response.status_code == 200:
                # Parse response to check for errors
                try:
                    response_data = response.json()
                    if isinstance(response_data, list):
                        for param in response_data:
                            if param.get('name') == 'OUT_errorMessage':
                                error_msg = param.get('value', '')
                                if error_msg:
                                    logger.error(f"ITSM API returned error in response: {error_msg}")
                                    raise Exception(f"ITSM Work Update failed: {error_msg}")
                            if param.get('name') == 'OUT_entryID':
                                entry_id = param.get('value', '')
                                logger.info(f"Work log entry created: {entry_id}")
                except:
                    pass
                    
                logger.info(f"ITSM Work Update successful for CRQ {change_id}")
                return True
            else:
                logger.error(f"ITSM Work Update failed: {response.status_code} - {response.text}")
                raise Exception(f"ITSM Work Update failed: HTTP {response.status_code}")
                
        except Exception as e:
            logger.error(f"ITSM Work Update error: {str(e)}", exc_info=True)
            raise
    
    def close_change_request(self, change_id, status_reason):
        """Close ITSM Change Request with status reason"""
        try:
            if not hasattr(self, '_authenticated') or not self._authenticated:
                logger.error("ITSM authentication not available - cannot close change request")
                raise Exception("ITSM Close Change failed: Authentication not available")
            
            # Map UI numeric status codes to Remedy values
            status_mapping = {
                '5000': '5000',  # Successful
                '6000': '6000',  # Successful with Issues  
                '7000': '7000',  # Unsuccessful
                '8000': '8000',  # Backed Out
                # Fallback for text values (backward compatibility)
                'Successful': '5000',
                'Successful with Issues': '6000',
                'Backed Out': '8000',
                'Unsuccessful': '7000'
            }
            
            # Get the correct Remedy status value
            remedy_status = status_mapping.get(status_reason, '5000')
            logger.info(f"Mapping status reason '{status_reason}' to Remedy value '{remedy_status}'")
            
            # Calculate end date (current timestamp)
            end_time = int(datetime.now().timestamp())
            
            # Build request body for close change
            request_body = {
                "inputParameters": [
                    {
                        "name": "INP_ChangeNumber",
                        "value": change_id
                    },
                    {
                        "name": "INP_EndDate",
                        "value": str(end_time)
                    },
                    {
                        "name": "INP_Result",
                        "value": remedy_status
                    }
                ]
            }
            
            # Make API call to close change request
            close_url = "https://itsmweb.{}bank.co.za:{port}/baocdp/rest/process/:SBSA-OA-Generic_ITSM_Interface:ChangeManagement:CloseChange/execute?mode=sync"
            
            headers = {
                'Content-Type': 'application/json',
                'Authentication-Token': self.auth_token
            }
            
            response = self.session.post(close_url, json=request_body, headers=headers, timeout=30)
            
            if response.status_code == 200:
                try:
                    response_data = response.json()
                    logger.info(f"ITSM Close Change Response: {json.dumps(response_data, indent=2)}")
                    
                    # Extract result message from OUT_Result parameter
                    result_message = None
                    
                    if isinstance(response_data, list):
                        for param in response_data:
                            if isinstance(param, dict) and param.get('name') == 'OUT_Result':
                                result_message = param.get('value', '')
                                break
                    
                    if result_message:
                        logger.info(f"ITSM Close Change result: {result_message}")
                        return result_message
                    else:
                        logger.error("ITSM Close Change completed but no result message found")
                        return "Change request closed successfully"
                        
                except json.JSONDecodeError as je:
                    logger.error(f"ITSM Close Change API returned invalid JSON: {response.text}")
                    raise Exception(f"ITSM Close Change response parsing failed: {str(je)}")
            else:
                logger.error(f"ITSM Close Change failed: {response.status_code} - {response.text}")
                raise Exception(f"ITSM Close Change failed: HTTP {response.status_code}")
                
        except Exception as e:
            logger.error(f"ITSM Close Change error: {str(e)}", exc_info=True)
            raise
    
    def add_work_log(self, change_id, notes):
        """Add work log entry to change request"""
        try:
            if not hasattr(self, '_authenticated') or not self._authenticated:
                logger.warning(f"ITSM not authenticated - cannot add work log to {change_id}")
                return False
            
            # Real ITSM API call would go here
            work_log_data = {
                'change_id': change_id,
                'notes': notes,
                'entry_type': 'Work Log',
                'created_by': 'CloudForge Automation',
                'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
            
            log_url = f"{self.base_url}/servlet/WorkLogServlet"
            response = self.session.post(log_url, json=work_log_data, timeout=30)
            
            if response.status_code == 200:
                logger.info(f"Work log added to ITSM Change Request {change_id}: {notes}")
                return True
            else:
                logger.error(f"ITSM Work log creation failed: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"ITSM Work log error: {str(e)}", exc_info=True)
            return False
    
    def _build_description(self, deployment_data):
        """Build detailed description for change request"""
        description = f"""
Automated CloudFormation deployment via CloudForge UI

Stack Details:
- Stack Name: {deployment_data['stack_name']}
- AWS Account: {deployment_data['account_id']}
- Region: {deployment_data['region']}
- Environment: {deployment_data.get('environment', 'Unknown')}
- Template: {deployment_data.get('template_path', 'N/A')}

Deployment Type: {deployment_data.get('deployment_type', 'CREATE')}
Requested By: {deployment_data['user_email']}
Deployment Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

This is an automated LOW RISK infrastructure change managed through CloudFormation.
"""
        return description.strip()
    
    def _build_implementation_plan(self, deployment_data):
        """Build implementation plan for change request"""
        plan = f"""
1. Validate CloudFormation template syntax
2. Deploy/Update CloudFormation stack: {deployment_data['stack_name']}
3. Monitor deployment progress via AWS CloudFormation console
4. Verify resource creation/updates
5. Update change request with deployment results

Automation: This deployment is fully automated via AWS CloudFormation
Risk Level: LOW - CloudFormation provides rollback capabilities
Impact: Minimal - Infrastructure changes only
"""
        return plan.strip()

# Global ITSM instance
itsm = ITSMIntegration()
