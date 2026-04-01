import yaml
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
                    
            elif check == 'tags_exist':
                missing = check_tags(props, rule.get('tags', []))
                if missing:
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
