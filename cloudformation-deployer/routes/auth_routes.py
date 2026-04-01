from flask import Blueprint, request, jsonify
import os
import logging
import json
import boto3
from botocore.exceptions import ClientError
from ldap3 import Server, Connection, ALL
from itsm_integration import ITSMIntegration

auth_bp = Blueprint('auth', __name__)
logger = logging.getLogger(__name__)

@auth_bp.route('/auth/login', methods=['POST'])
def ldap_login():
    try:
        data = request.json
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        
        if not username or not password:
            return jsonify({'error': 'Username and password are required'}), 400
        
        # LDAP configuration
        ldap_server = os.environ.get('LDAP_URL', 'ldaps://ldapadprd.za.sbicdirectory.com:3269')
        ldap_base = os.environ.get('LDAP_BASE', 'DC=za,DC=sbicdirectory,DC=com')
        
        logger.info(f"Attempting LDAP connection to: {ldap_server}")
        
        # Create LDAP server connection with timeout
        server = Server(ldap_server, get_info=ALL, use_ssl=True, connect_timeout=60)
        
        # Format username for authentication
        if '@' not in username:
            user_principal = f'{username}@za.sbicdirectory.com'
        else:
            user_principal = username
        
        # Try to bind with user credentials
        conn = Connection(server, user=user_principal, password=password, auto_bind=False)
        
        try:
            bind_result = conn.bind()
        except Exception as bind_error:
            logger.error(f"AUDIT: LDAP bind error for {username} - {str(bind_error)}")
            return jsonify({'error': 'LDAP server connection failed'}), 503
        if not bind_result:
            logger.warning(f"AUDIT: Failed login attempt for {username} - Invalid credentials: {conn.result}")
            return jsonify({'error': 'Invalid credentials'}), 401
        
        # Extract username without domain
        base_username = username.split('@')[0] if '@' in username else username
        
        # Search for user using userPrincipalName instead of sAMAccountName
        search_filter = f'(userPrincipalName={user_principal})'
        
        conn.search(
            search_base=ldap_base,
            search_filter=search_filter,
            attributes=['userPrincipalName', 'displayName', 'mail', 'sAMAccountName', 'memberOf']
        )
        
        if not conn.entries:
            logger.warning(f"AUDIT: Failed login attempt for {username} - User not found in directory")
            conn.unbind()
            return jsonify({'error': 'User not found'}), 401
        
        user_entry = conn.entries[0]
        
        # Check if user is member of required group (directly or through nested groups)
        ldap_group = 'CN=sbgdp_infrabrew,OU=Global Security Groups,OU=Security Groups,OU=Domain Groups,DC=za,DC=sbicdirectory,DC=com'
        user_groups = user_entry.memberOf.values if hasattr(user_entry, 'memberOf') else []
        
        # Check direct membership
        is_member = ldap_group in user_groups
        
        # If not direct member, check nested groups
        if not is_member:
            for group_dn in user_groups:
                nested_search = f'(&(distinguishedName={group_dn})(memberOf:1.2.840.113556.1.4.1941:={ldap_group}))'
                conn.search(
                    search_base=ldap_base,
                    search_filter=nested_search,
                    attributes=['distinguishedName']
                )
                if conn.entries:
                    is_member = True
                    break
        
        if not is_member:
            logger.warning(f"AUDIT: Failed login attempt for {username} - User not in required group (checked nested)")
            conn.unbind()
            return jsonify({'error': 'Insufficient permissions - not in sbgdp_infrabrew group'}), 401
        
        user_email = str(user_entry.mail) if hasattr(user_entry, 'mail') else user_principal
        display_name = str(user_entry.displayName) if hasattr(user_entry, 'displayName') else username
        
        logger.info(f"AUDIT: Successful login for {username}")
        
        # Authenticate with ITSM for SSO
        try:
            itsm = ITSMIntegration()
            itsm_auth_success = itsm.authenticate(username, password)
            if itsm_auth_success:
                logger.info(f"ITSM SSO authentication successful for {username}")
            else:
                logger.warning(f"ITSM SSO authentication failed for {username} - continuing without ITSM access")
        except Exception as itsm_error:
            logger.warning(f"ITSM SSO error for {username}: {str(itsm_error)} - continuing without ITSM access")
        
        conn.unbind()
        
        return jsonify({
            'success': True,
            'email': user_email,
            'displayName': display_name
        })
        
    except Exception as e:
        logger.error(f"AUDIT: Login error for {username if 'username' in locals() else 'unknown'} - {str(e)}")
        return jsonify({'error': 'Authentication failed'}), 401

@auth_bp.route('/check-cloudforge-access', methods=['POST'])
def check_cloudforge_access():
    try:
        data = request.json
        user_email = data.get('userEmail', '').strip().lower()
        
        if not user_email:
            return jsonify({'authorized': False})
        
        # Read authorized users file
        authorized_file = os.path.join(os.path.dirname(__file__), '..', 'cloudinfra-authorized-users.txt')
        if not os.path.exists(authorized_file):
            return jsonify({'authorized': False})
        
        with open(authorized_file, 'r') as f:
            authorized_emails = []
            for line in f:
                line = line.strip().lower()
                if line and not line.startswith('#'):
                    authorized_emails.append(line)
        
        return jsonify({'authorized': user_email in authorized_emails})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def _get_prod_accounts():
    """Get production account IDs from Secrets Manager or fallback to file"""
    try:
        secrets_client = boto3.client('secretsmanager')
        secret_response = secrets_client.get_secret_value(SecretId='cloudforge/secrets/prod-accounts-list')
        secret_data = json.loads(secret_response['SecretString'])
        prod_accounts = secret_data.get('accounts', [])
        logger.info("✅ PROD ACCOUNTS SOURCE: AWS Secrets Manager")
        return prod_accounts
    except (ClientError, KeyError, json.JSONDecodeError) as e:
        logger.warning(f"⚠️ Secrets Manager unavailable ({str(e)}), using fallback file")
        try:
            with open('prod_accounts.txt', 'r') as f:
                prod_accounts = [line.strip() for line in f if line.strip()]
            logger.info("✅ PROD ACCOUNTS SOURCE: prod_accounts.txt file")
            return prod_accounts
        except FileNotFoundError:
            logger.error("❌ No prod accounts found in Secrets Manager or file")
            return []

@auth_bp.route('/check-account-environment', methods=['POST'])
def check_account_environment():
    try:
        data = request.json
        account_id = data.get('accountId', '').strip()
        
        logger.info(f"Checking environment for account: {account_id}")
        
        if not account_id:
            return jsonify({'error': 'Account ID is required'}), 400
        
        # Load production account IDs from Secrets Manager or file (always load to show source)
        prod_accounts = _get_prod_accounts()
        
        # Determine if account is PROD
        is_prod = account_id in prod_accounts
        
        # Special case: 573185292006 can access all environments
        if account_id == '573185292006':
            logger.info(f"Account {account_id} has access to all environments")
            return jsonify({'environmentType': 'all', 'isProd': True, 'requiresEnvironment': True})
        
        # Determine environment type based on account
        if is_prod:
            environment_type = 'prod_only'
            logger.info(f"Account {account_id} identified as PROD - environment selection required")
        else:
            environment_type = 'non_prod'
            logger.info(f"Account {account_id} identified as NON-PROD - environment selection not required")
        
        return jsonify({
            'environmentType': environment_type,
            'isProd': is_prod,
            'requiresEnvironment': is_prod
        })
    except Exception as e:
        logger.error(f"Error checking account environment: {str(e)}")
        return jsonify({'error': str(e)}), 500