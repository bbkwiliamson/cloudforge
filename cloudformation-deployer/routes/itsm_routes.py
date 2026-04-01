from flask import Blueprint, request, jsonify
import logging
import time
from datetime import datetime
from itsm_integration import ITSMIntegration

itsm_bp = Blueprint('itsm', __name__)
logger = logging.getLogger(__name__)

@itsm_bp.route('/itsm/authenticate', methods=['POST'])
def authenticate_itsm():
    """Authenticate with ITSM system"""
    try:
        itsm = ITSMIntegration()
        
        # Force re-authentication
        success = itsm.authenticate()
        
        if success:
            logger.info("ITSM authentication successful")
            return jsonify({
                'success': True,
                'message': 'ITSM authentication successful'
            })
        else:
            logger.error("ITSM authentication failed")
            return jsonify({
                'success': False,
                'error': 'ITSM authentication failed'
            }), 401
            
    except Exception as e:
        logger.error(f"ITSM authentication error: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'ITSM authentication error: {str(e)}'
        }), 500

@itsm_bp.route('/itsm/query-change', methods=['POST'])
def query_itsm_change():
    try:
        data = request.json
        crq_number = data.get('crqNumber', '').strip()
        
        if not crq_number:
            return jsonify({'error': 'CRQ number is required'}), 400
        
        itsm = ITSMIntegration()
        
        # Authenticate with ITSM if not already authenticated
        if not itsm._authenticated:
            itsm.authenticate()
        
        if not itsm._authenticated:
            return jsonify({'error': 'ITSM authentication failed'}), 401
        
        # Query the change request
        query_url = 'https://itsmweb.{}bank.co.za:{port}/baocdp/rest/process/:SBSA-OA-Generic_ITSM_Interface:ChangeManagement:QueryChange/execute?mode=sync'
        
        request_body = {
            'inputParameters': [
                {
                    'name': 'INP_ChangeNumber',
                    'value': crq_number
                }
            ]
        }
        
        headers = {
            'Content-Type': 'application/json',
            'Authentication-Token': itsm.auth_token
        }
        
        response = itsm.session.post(query_url, json=request_body, headers=headers, timeout=30)
        
        if response.status_code == 200:
            response_data = response.json()
            # Parse response into a dictionary
            crq_data = {}
            if isinstance(response_data, list):
                for param in response_data:
                    if isinstance(param, dict):
                        crq_data[param.get('name', '')] = param.get('value', '')
            
            return jsonify({'success': True, 'data': crq_data})
        else:
            return jsonify({'error': f'Query failed: {response.status_code}'}), 500
            
    except Exception as e:
        logger.error(f'ITSM query error: {str(e)}')
        return jsonify({'error': str(e)}), 500

@itsm_bp.route('/itsm/access', methods=['GET'])
def itsm_access():
    """Redirect to ITSM with SSO if authenticated"""
    try:
        # Check if user has active session (you might want to implement session management)
        return jsonify({
            'itsm_url': 'https://itsmweb.{}bank.co.za/arsys/',
            'message': 'ITSM access available via SSO after login'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@itsm_bp.route('/itsm/change-status/<change_id>', methods=['GET'])
def get_change_status(change_id):
    """Get ITSM change request status"""
    try:
        # This would require implementing a status check method in ITSM integration
        return jsonify({
            'change_id': change_id,
            'status': 'Check ITSM directly for current status',
            'itsm_url': f'https://itsmweb.{}bank.co.za/arsys/forms/itsmweb.standardbank.co.za/CHG%3AChangeInterface/Default%20Administrator%20View/?mode=search&F304255610=%3D%22{change_id}%22'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@itsm_bp.route('/create-crq', methods=['POST'])
def create_crq():
    """Create ITSM Change Request for PROD deployments"""
    try:
        data = request.json
        deployment_data = data.get('deploymentData', {})
        
        logger.info(f"CRQ creation requested for stack: {deployment_data.get('stack_name')}")
        
        itsm = ITSMIntegration()
        
        # Ensure ITSM is authenticated
        if not itsm._authenticated:
            logger.info("ITSM not authenticated, attempting authentication...")
            if not itsm.authenticate():
                raise Exception("ITSM authentication failed - cannot create change request")
        
        # Create ITSM Change Request
        change_id = itsm.create_change_request(deployment_data)
        
        if change_id:
            logger.info(f"CRQ created successfully: {change_id}")
            return jsonify({
                'success': True,
                'changeId': change_id,
                'message': f'Change Request {change_id} created successfully'
            })
        else:
            logger.error("Failed to create CRQ - no change ID returned")
            return jsonify({
                'success': False,
                'error': 'Failed to create Change Request - ITSM service unavailable'
            }), 500
            
    except Exception as e:
        logger.error(f"CRQ creation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'CRQ creation failed: {str(e)}'
        }), 500

@itsm_bp.route('/update-crq-work', methods=['POST'])
def update_crq_work():
    """Update ITSM Change Request with work information"""
    try:
        data = request.json
        change_id = data.get('changeId')
        work_info_type = data.get('workInfoType')
        attachment_data = data.get('attachmentData')
        attachment_name = data.get('attachmentName')
        
        logger.info(f"CRQ work update requested for: {change_id}")
        logger.info(f"Work Info Type: {work_info_type}")
        logger.info(f"Attachment Name: {attachment_name}")
        logger.info(f"Attachment Data received: {len(attachment_data) if attachment_data else 0} bytes")
        
        itsm = ITSMIntegration()
        
        # Ensure ITSM is authenticated
        if not itsm._authenticated:
            logger.info("ITSM not authenticated, attempting authentication...")
            if not itsm.authenticate():
                raise Exception("ITSM authentication failed - cannot update change request")
        
        # Update ITSM Change Request
        success = itsm.update_work_info(change_id, work_info_type, attachment_data, attachment_name)
        
        if success:
            logger.info(f"CRQ work update successful: {change_id}")
            return jsonify({
                'success': True,
                'message': f'Change Request {change_id} updated successfully'
            })
        else:
            logger.error("Failed to update CRQ work info")
            return jsonify({
                'success': False,
                'error': 'Failed to update Change Request work information'
            }), 500
            
    except Exception as e:
        logger.error(f"CRQ work update error: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'CRQ work update failed: {str(e)}'
        }), 500

@itsm_bp.route('/close-crq', methods=['POST'])
def close_crq():
    """Close ITSM Change Request"""
    try:
        data = request.json
        change_id = data.get('changeId')
        status_reason = data.get('statusReason')
        
        logger.info(f"CRQ close requested for: {change_id} with status: {status_reason}")
        
        itsm = ITSMIntegration()
        
        # Ensure ITSM is authenticated
        if not itsm._authenticated:
            logger.info("ITSM not authenticated, attempting authentication...")
            if not itsm.authenticate():
                raise Exception("ITSM authentication failed - cannot close change request")
        
        # Close ITSM Change Request
        result_message = itsm.close_change_request(change_id, status_reason)
        
        logger.info(f"CRQ close successful: {change_id}")
        return jsonify({
            'success': True,
            'message': result_message
        })
            
    except Exception as e:
        logger.error(f"CRQ close error: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'CRQ close failed: {str(e)}'
        }), 500

@itsm_bp.route('/tutorial/check', methods=['POST'])
def check_tutorial_status():
    """Check if user needs to see tutorial based on client-side timestamp"""
    try:
        data = request.json
        user_email = data.get('userEmail', '').strip().lower()
        last_tutorial = data.get('lastTutorial', 0)  # Timestamp from localStorage
        
        if not user_email:
            return jsonify({'showTutorial': True})
        
        # Check if 365 days have passed (365 * 24 * 60 * 60 * 1000 milliseconds)
        current_time = int(time.time() * 1000)
        days_365_ms = 365 * 24 * 60 * 60 * 1000
        
        show_tutorial = (current_time - last_tutorial) >= days_365_ms
        
        return jsonify({
            'showTutorial': show_tutorial,
            'currentTime': current_time
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
