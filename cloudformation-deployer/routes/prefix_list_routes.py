from flask import Blueprint, request, jsonify
import yaml
import json
import logging
from utils.aws_client import create_aws_client

prefix_list_bp = Blueprint('prefix_list', __name__)
logger = logging.getLogger(__name__)


class CFLoader(yaml.SafeLoader):
    pass

def _cf_constructor(loader, tag_suffix, node):
    if isinstance(node, yaml.ScalarNode):
        return {tag_suffix: loader.construct_scalar(node)}
    elif isinstance(node, yaml.SequenceNode):
        return {tag_suffix: loader.construct_sequence(node)}
    elif isinstance(node, yaml.MappingNode):
        return {tag_suffix: loader.construct_mapping(node)}
    return {tag_suffix: None}

for tag in ['!Ref', '!GetAtt', '!Join', '!Sub', '!Select', '!Split', '!Base64',
            '!GetAZs', '!ImportValue', '!FindInMap', '!Condition',
            '!If', '!Not', '!Equals', '!And', '!Or']:
    CFLoader.add_multi_constructor(tag, _cf_constructor)


def _is_prefix_list_template(template: dict) -> bool:
    """Check if the template contains an AWS::EC2::PrefixList resource."""
    for resource in template.get('Resources', {}).values():
        if resource.get('Type') == 'AWS::EC2::PrefixList':
            return True
    return False


def patch_prefix_list_template(template_body: str, allowed_cidrs_value: str) -> str:
    """
    Rewrites only the Entries block in the PrefixList resource using string
    replacement, leaving the rest of the template untouched.
    """
    try:
        template = yaml.load(template_body, Loader=CFLoader)
    except yaml.YAMLError:
        template = json.loads(template_body)

    if not _is_prefix_list_template(template):
        return template_body

    cidrs = [c.strip() for c in allowed_cidrs_value.split(',') if c.strip()]
    cidr_count = len(cidrs)

    # Build the new Entries block as a raw YAML string
    entries_lines = ['      Entries:']
    for i in range(cidr_count):
        entries_lines.append(f'        - Cidr: !Select [{i}, !Ref AllowedCidrs]')
    new_entries_block = '\n'.join(entries_lines)

    # Replace the existing Entries block using regex
    import re
    pattern = r'      Entries:.*?(?=\n      [A-Z]|\n    [A-Z]|\Z)'
    patched = re.sub(pattern, new_entries_block, template_body, flags=re.DOTALL)

    if patched == template_body:
        logger.warning("Entries block not found in template — no patch applied")

    logger.info(f"PrefixList Entries patched to {cidr_count} entries")
    return patched


@prefix_list_bp.route('/prefix-list/validate', methods=['POST'])
def validate_prefix_list():
    """
    Validate and patch a prefix list template before deployment.
    Returns the patched template body and a summary of changes.
    """
    try:
        data = request.json
        template_body = data.get('templateBody', '')
        parameters = data.get('parameters', {})

        allowed_cidrs = parameters.get('AllowedCidrs', '')
        if not allowed_cidrs:
            return jsonify({'templateBody': template_body, 'patched': False, 'cidrCount': 0})

        cidrs = [c.strip() for c in allowed_cidrs.split(',') if c.strip()]
        patched_template = patch_prefix_list_template(template_body, allowed_cidrs)
        patched = patched_template != template_body

        return jsonify({
            'templateBody': patched_template,
            'patched': patched,
            'cidrCount': len(cidrs),
            'cidrs': cidrs
        })

    except Exception as e:
        logger.error(f"Prefix list validation error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@prefix_list_bp.route('/prefix-list/sync', methods=['POST'])
def sync_prefix_list():
    """
    Sync a deployed prefix list stack by patching the template Entries
    to match the current AllowedCidrs parameter, then triggering an update.
    """
    try:
        data = request.json
        stack_name = data['stackName']
        region = data['region']
        account_id = data['accountId']
        parameters = data.get('parameters', {})
        user_email = data.get('userEmail', 'unknown')

        cf = create_aws_client('cloudformation', region, account_id)

        # Fetch current stack state
        stack_response = cf.describe_stacks(StackName=stack_name)
        stack = stack_response['Stacks'][0]
        existing_params = {p['ParameterKey']: p['ParameterValue'] for p in stack.get('Parameters', [])}

        # Merge with any incoming parameter overrides
        merged_params = {**existing_params, **parameters}
        allowed_cidrs = merged_params.get('AllowedCidrs', '')

        if not allowed_cidrs:
            return jsonify({'error': 'AllowedCidrs parameter not found in stack or request'}), 400

        cidrs = [c.strip() for c in allowed_cidrs.split(',') if c.strip()]

        # Fetch the current template
        template_response = cf.get_template(StackName=stack_name, TemplateStage='Original')
        template_body = template_response.get('TemplateBody', '')
        if isinstance(template_body, dict):
            template_body = json.dumps(template_body)

        # Patch the template
        patched_template = patch_prefix_list_template(template_body, allowed_cidrs)

        # Push the update
        params = [{'ParameterKey': k, 'ParameterValue': v} for k, v in merged_params.items()]
        response = cf.update_stack(
            StackName=stack_name,
            TemplateBody=patched_template,
            Parameters=params,
            Capabilities=['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND']
        )

        logger.info(f"AUDIT: PrefixList sync by {user_email} for stack {stack_name} — {len(cidrs)} entries")
        return jsonify({
            'stackId': response['StackId'],
            'cidrCount': len(cidrs),
            'cidrs': cidrs,
            'message': f'Prefix list synced with {len(cidrs)} CIDR entries'
        })

    except Exception as e:
        if 'No updates are to be performed' in str(e):
            return jsonify({'message': 'Prefix list is already in sync', 'alreadySynced': True})
        logger.error(f"Prefix list sync error: {str(e)}")
        return jsonify({'error': str(e)}), 500
