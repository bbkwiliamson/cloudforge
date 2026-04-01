from flask import Blueprint, request, jsonify
import yaml
import json
import os
import boto3
import botocore.exceptions
import logging
from werkzeug.utils import secure_filename
from utils.guard_validator import validate_template

template_bp = Blueprint('template', __name__)
logger = logging.getLogger(__name__)

TEMPLATES_BUCKET = os.environ.get('TEMPLATES_BUCKET', 'cloudforge-templates-bucket')
GUARD_RULES_KEY = os.environ.get('GUARD_RULES_KEY', 'guard-rules/cloudforge-guard-rules.yaml')

# Custom YAML loader for CloudFormation templates
class CFLoader(yaml.SafeLoader):
    pass

def construct_cf_function(loader, tag_suffix, node):
    if isinstance(node, yaml.ScalarNode):
        return {tag_suffix: loader.construct_scalar(node)}
    elif isinstance(node, yaml.SequenceNode):
        return {tag_suffix: loader.construct_sequence(node)}
    elif isinstance(node, yaml.MappingNode):
        return {tag_suffix: loader.construct_mapping(node)}
    else:
        return {tag_suffix: None}

# Register CloudFormation functions
for tag in ['!Ref', '!GetAtt', '!Join', '!Sub', '!Select', '!Split', '!Base64', '!GetAZs', '!ImportValue', '!FindInMap', '!Condition', '!If', '!Not', '!Equals', '!And', '!Or']:
    CFLoader.add_multi_constructor(tag, construct_cf_function)

def construct_transform(loader, node):
    return loader.construct_scalar(node)

CFLoader.add_constructor('tag:yaml.org,2002:str', construct_transform)

def get_s3_client():
    return boto3.client('s3', region_name=os.environ.get('AWS_DEFAULT_REGION', 'af-south-1'))

def parse_template_content(content):
    try:
        template = yaml.load(content, Loader=CFLoader)
    except yaml.YAMLError:
        try:
            template = json.loads(content)
        except json.JSONDecodeError:
            return None, 'Invalid YAML/JSON format'
    if not isinstance(template, dict):
        return None, 'Template must be a valid CloudFormation template'
    return template, None

@template_bp.route('/list-templates', methods=['GET'])
def list_templates():
    try:
        s3 = get_s3_client()
        paginator = s3.get_paginator('list_objects_v2')
        templates = []
        for page in paginator.paginate(Bucket=TEMPLATES_BUCKET):
            for obj in page.get('Contents', []):
                key = obj['Key']
                if key.endswith(('.yaml', '.yml', '.json')) and not key.startswith('.') and not key.startswith('guard-rules/'):
                    folder = key.split('/')[0] if '/' in key else ''
                    filename = key.split('/')[-1]
                    display_name = filename.replace('.yaml', '').replace('.yml', '').replace('.json', '').replace('_', ' ').replace('-', ' ').title()
                    if folder:
                        display_name = f"{folder.replace('_', ' ').replace('-', ' ').title()} - {display_name}"
                    templates.append({
                        'key': key,
                        'displayName': display_name,
                        'lastModified': obj['LastModified'].isoformat(),
                        'size': obj['Size']
                    })
        return jsonify({'templates': templates})
    except Exception as e:
        logger.error(f"Error listing templates from S3: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Custom upload endpoint - allows users to upload templates not in S3
@template_bp.route('/parse-template', methods=['POST'])
def parse_template():
    try:
        if 'template' not in request.files:
            return jsonify({'error': 'No template file provided'}), 400

        file = request.files['template']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        content = file.read().decode('utf-8')

        if not content.strip():
            return jsonify({'error': 'Template file is empty'}), 400

        template, error = parse_template_content(content)
        if error:
            return jsonify({'error': error}), 400

        parameters = template.get('Parameters', {})
        return jsonify({'parameters': parameters, 'templateBody': content})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@template_bp.route('/load-template', methods=['POST'])
def load_template():
    try:
        data = request.json
        template_name = data['templateName']

        s3 = get_s3_client()
        response = s3.get_object(Bucket=TEMPLATES_BUCKET, Key=template_name)
        content = response['Body'].read().decode('utf-8')

        template, error = parse_template_content(content)
        if error:
            return jsonify({'error': error}), 400

        parameters = template.get('Parameters', {})
        return jsonify({'parameters': parameters})
    except botocore.exceptions.ClientError as e:
        if e.response['Error']['Code'] == 'NoSuchKey':
            return jsonify({'error': 'Template not found in S3'}), 404
        logger.error(f"Error loading template from S3: {str(e)}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error loading template from S3: {str(e)}")
        return jsonify({'error': str(e)}), 400


@template_bp.route('/validate-template', methods=['POST'])
def validate_template_route():
    try:
        data = request.json
        template_name = data.get('templateName')
        template_body = data.get('templateBody')

        s3 = get_s3_client()

        # Get template content
        if template_body:
            content = template_body
        elif template_name:
            response = s3.get_object(Bucket=TEMPLATES_BUCKET, Key=template_name)
            content = response['Body'].read().decode('utf-8')
        else:
            return jsonify({'error': 'No template provided'}), 400

        template, error = parse_template_content(content)
        if error:
            return jsonify({'error': error}), 400

        # Fetch guard rules from S3
        try:
            rules_response = s3.get_object(Bucket=TEMPLATES_BUCKET, Key=GUARD_RULES_KEY)
            rules_content = yaml.safe_load(rules_response['Body'].read().decode('utf-8'))
            rules = rules_content.get('rules', [])
        except botocore.exceptions.ClientError:
            logger.warning("Guard rules not found in S3, skipping validation")
            return jsonify({'findings': [], 'message': 'No guard rules found'})

        findings = validate_template(template, rules)

        return jsonify({
            'findings': findings,
            'totalFindings': len(findings),
            'highCount': len([f for f in findings if f['severity'] == 'HIGH']),
            'mediumCount': len([f for f in findings if f['severity'] == 'MEDIUM'])
        })
    except Exception as e:
        logger.error(f"Template validation error: {str(e)}")
        return jsonify({'error': str(e)}), 500
