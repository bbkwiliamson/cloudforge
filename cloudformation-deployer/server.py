from flask import Flask, request, jsonify, send_from_directory
import os
import sys
import logging
import ipaddress
from itsm_integration import ITSMIntegration

# Import blueprints
from routes.aws_resources_routes import aws_resources_bp
from routes.cloudformation_routes import cloudformation_bp
from routes.service_catalog_routes import service_catalog_bp
from routes.deployment_routes import deployment_bp
from routes.template_routes import template_bp
from routes.auth_routes import auth_bp
from routes.itsm_routes import itsm_bp
from routes.stack_mgmt_routes import stack_mgmt_bp
from routes.s3_routes import s3_routes_bp

# Initialize ITSM integration and authenticate
itsm = ITSMIntegration()
itsm.authenticate()

# VPN IP ranges
ALLOWED_IP_RANGES = [
    ipaddress.ip_network('172.17.0.0/16'),
    ipaddress.ip_network('172.16.0.0/16'),
    ipaddress.ip_network('10.0.0.0/8'),
    ipaddress.ip_network('127.0.0.0/8'),
    ipaddress.ip_network('192.168.0.0/16')
]

def is_ip_allowed(client_ip):
    try:
        client_ip_obj = ipaddress.ip_address(client_ip)
        return any(client_ip_obj in network for network in ALLOWED_IP_RANGES)
    except ValueError:
        return False

def check_ip_access():
    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    if ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()
    
    if not is_ip_allowed(client_ip):
        return jsonify({'error': 'Access denied. VPN connection required.'}), 403
    return None

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'

# Register blueprints
app.register_blueprint(aws_resources_bp)
app.register_blueprint(cloudformation_bp)
app.register_blueprint(service_catalog_bp)
app.register_blueprint(deployment_bp)
app.register_blueprint(template_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(itsm_bp)
app.register_blueprint(stack_mgmt_bp)
app.register_blueprint(s3_routes_bp)

@app.before_request
def restrict_access():
    if request.endpoint == 'health_check':
        return None
    return check_ip_access()

@app.route('/health')
def health_check():
    return jsonify({'status': 'healthy', 'service': 'CloudForge Template Deployer'}), 200

@app.route('/')
def index():
    return send_from_directory('public', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('public', filename)

if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', 3000))
    app.run(debug=False, host=host, port=port)