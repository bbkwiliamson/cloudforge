import yaml
import re
import logging

logger = logging.getLogger(__name__)

def get_nested_property(resource_props, property_path):
    """Get a nested property value from resource properties"""
    parts = property_path.replace('[*]', '').split('.')
    current = resource_props
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
        if current is None:
            return None
    return current

def check_tags(resource_props, required_tags):
    """Check if resource has required tags"""
    tags = resource_props.get('Tags', [])
    if isinstance(tags, list):
        tag_keys = [t.get('Key', '') for t in tags if isinstance(t, dict)]
    elif isinstance(tags, dict):
        tag_keys = list(tags.keys())
    else:
        tag_keys = []
    return [t for t in required_tags if t not in tag_keys]

def check_iam_policy_wildcards(resource_props, field):
    """Check IAM policy statements for wildcard values in a given field"""
    statements = []
    for key in ('PolicyDocument', 'AssumeRolePolicyDocument'):
        doc = resource_props.get(key, {})
        statements.extend(doc.get('Statement', []))
    for policy in resource_props.get('Policies', []):
        statements.extend(policy.get('PolicyDocument', {}).get('Statement', []))
    for stmt in statements:
        val = stmt.get(field, [])
        if isinstance(val, str):
            val = [val]
        if '*' in val:
            return True
    return False

def evaluate_condition(props, condition):
    """Evaluate a single rule condition against resource properties"""
    check = condition.get('check', '')
    prop = condition.get('property', '')
    val = get_nested_property(props, prop) if prop else None

    if check == 'property_exists':
        return val is not None
    if check == 'property_equals':
        return val == condition.get('value')
    if check == 'property_not_equals':
        return val is not None and val != condition.get('value')
    if check == 'property_not_contains':
        if isinstance(val, list):
            return condition.get('value') not in val
        return val != condition.get('value')
    if check == 'property_contains':
        return isinstance(val, list) and condition.get('value') in val
    if check == 'property_in_list':
        return val is None or val in condition.get('values', [])
    if check == 'property_not_in_list':
        return val is None or val not in condition.get('values', [])
    if check == 'property_matches_regex':
        return isinstance(val, str) and bool(re.match(condition.get('pattern', ''), val))
    if check == 'property_greater_than':
        return isinstance(val, (int, float)) and val > condition.get('value', 0)
    if check == 'property_less_than':
        return isinstance(val, (int, float)) and val < condition.get('value', 0)
    if check == 'property_not_empty':
        return val is not None and val != '' and val != [] and val != {}
    if check == 'property_is_type':
        type_map = {'string': str, 'list': list, 'int': int, 'bool': bool, 'dict': dict, 'float': float}
        return isinstance(val, type_map.get(condition.get('type', ''), type(None)))
    if check == 'property_length_min':
        return hasattr(val, '__len__') and len(val) >= condition.get('value', 0)
    if check == 'property_length_max':
        return hasattr(val, '__len__') and len(val) <= condition.get('value', 0)
    if check == 'property_starts_with':
        return isinstance(val, str) and val.startswith(condition.get('value', ''))
    if check == 'property_ends_with':
        return isinstance(val, str) and val.endswith(condition.get('value', ''))
    if check == 'property_keys_in_list':
        return isinstance(val, dict) and all(k in condition.get('values', []) for k in val)
    if check == 'tags_exist':
        return not check_tags(props, condition.get('tags', []))
    return False

def validate_template(template, rules):
    """Validate a CloudFormation template against guard rules"""
    findings = []
    resources = template.get('Resources', {})
    
    for resource_name, resource_def in resources.items():
        resource_type = resource_def.get('Type', '')
        props = resource_def.get('Properties', {})
        
        for rule in rules:
            rule_resource = rule.get('resource', '')
            if rule_resource != '*' and rule_resource != resource_type:
                continue

            check = rule.get('check', '')
            prop = rule.get('property', '')
            
            violated = False
            
            if check == 'property_exists':
                if get_nested_property(props, prop) is None:
                    violated = True
                    
            elif check == 'property_equals':
                val = get_nested_property(props, prop)
                if val != rule.get('value'):
                    violated = True
                    
            elif check == 'property_not_equals':
                val = get_nested_property(props, prop)
                if val is None or val == rule.get('value'):
                    violated = True
                    
            elif check == 'property_not_contains':
                val = get_nested_property(props, prop)
                if isinstance(val, list) and rule.get('value') in val:
                    violated = True
                elif val == rule.get('value'):
                    violated = True
            
            elif check == 'property_contains':
                val = get_nested_property(props, prop)
                if not isinstance(val, list) or rule.get('value') not in val:
                    violated = True
                    
            elif check == 'property_in_list':
                val = get_nested_property(props, prop)
                if val is not None and val not in rule.get('values', []):
                    violated = True
                    
            elif check == 'property_not_in_list':
                val = get_nested_property(props, prop)
                if val is not None and val in rule.get('values', []):
                    violated = True
                    
            elif check == 'property_matches_regex':
                val = get_nested_property(props, prop)
                if not isinstance(val, str) or not re.match(rule.get('pattern', ''), val):
                    violated = True
                    
            elif check == 'property_greater_than':
                val = get_nested_property(props, prop)
                if not isinstance(val, (int, float)) or val <= rule.get('value', 0):
                    violated = True
                    
            elif check == 'property_less_than':
                val = get_nested_property(props, prop)
                if not isinstance(val, (int, float)) or val >= rule.get('value', 0):
                    violated = True
                    
            elif check == 'property_not_empty':
                val = get_nested_property(props, prop)
                if val is None or val == '' or val == [] or val == {}:
                    violated = True
                    
            elif check == 'property_is_type':
                val = get_nested_property(props, prop)
                type_map = {'string': str, 'list': list, 'int': int, 'bool': bool, 'dict': dict, 'float': float}
                if not isinstance(val, type_map.get(rule.get('type', ''), type(None))):
                    violated = True
                    
            elif check == 'property_length_min':
                val = get_nested_property(props, prop)
                if not hasattr(val, '__len__') or len(val) < rule.get('value', 0):
                    violated = True
                    
            elif check == 'property_length_max':
                val = get_nested_property(props, prop)
                if not hasattr(val, '__len__') or len(val) > rule.get('value', 0):
                    violated = True
                    
            elif check == 'property_starts_with':
                val = get_nested_property(props, prop)
                if not isinstance(val, str) or not val.startswith(rule.get('value', '')):
                    violated = True
                    
            elif check == 'property_ends_with':
                val = get_nested_property(props, prop)
                if not isinstance(val, str) or not val.endswith(rule.get('value', '')):
                    violated = True
                    
            elif check == 'property_keys_in_list':
                val = get_nested_property(props, prop)
                if not isinstance(val, dict) or not all(k in rule.get('values', []) for k in val):
                    violated = True
                    
            elif check == 'tags_exist':
                missing = check_tags(props, rule.get('tags', []))
                if missing:
                    violated = True
                    
            elif check == 'any_of':
                if not any(evaluate_condition(props, c) for c in rule.get('conditions', [])):
                    violated = True
                    
            elif check == 'all_of':
                if not all(evaluate_condition(props, c) for c in rule.get('conditions', [])):
                    violated = True
                    
            elif check == 'dependent_property':
                when = rule.get('when', {})
                then = rule.get('then', {})
                if evaluate_condition(props, when):
                    if not evaluate_condition(props, then):
                        violated = True
                        
            elif check == 'no_wildcard_principals':
                if check_iam_policy_wildcards(props, 'Principal'):
                    violated = True
                    
            elif check == 'no_wildcard_actions':
                if check_iam_policy_wildcards(props, 'Action'):
                    violated = True
            
            if violated:
                findings.append({
                    'rule': rule.get('name', 'Unknown'),
                    'resource': resource_name,
                    'resourceType': resource_type,
                    'severity': rule.get('severity', 'MEDIUM'),
                    'message': rule.get('message', '')
                })
    
    return findings
