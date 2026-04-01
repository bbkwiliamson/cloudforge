from flask import Blueprint, request, jsonify
from utils.aws_client import create_aws_client
import logging

s3_routes_bp = Blueprint('s3_routes', __name__)
logger = logging.getLogger(__name__)

@s3_routes_bp.route('/list-s3-buckets', methods=['POST'])
def list_s3_buckets():
    try:
        data = request.json
        region = data['region']
        access_key_id = data['accessKeyId']
        secret_access_key = data['secretAccessKey']
        query = data.get('query', '').lower()
        
        s3 = create_aws_client('s3', region, access_key_id, secret_access_key)
        
        response = s3.list_buckets()
        buckets = []
        
        for bucket in response.get('Buckets', []):
            bucket_name = bucket['Name']
            if query in bucket_name.lower():
                buckets.append({
                    'name': bucket_name,
                    'creationDate': bucket['CreationDate'].isoformat()
                })
        
        buckets.sort(key=lambda x: x['name'])
        return jsonify({'buckets': buckets[:50]})
    except Exception as e:
        logger.error(f"Error listing S3 buckets: {str(e)}")
        return jsonify({'error': str(e)}), 500
