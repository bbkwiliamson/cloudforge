// Core application variables
let templatePath = '';
let templateBody = '';  // Store template content in memory
let parameterGroups = [];
let currentGroup = 0;
let currentTemplateName = '';

// Utility functions
function showAlert(message, type = 'error') {
    const overlay = document.createElement('div');
    overlay.className = 'alert-overlay';
    
    const alertBox = document.createElement('div');
    alertBox.className = `custom-alert alert-${type}`;
    alertBox.textContent = message;
    
    document.body.appendChild(overlay);
    document.body.appendChild(alertBox);
    
    const closeAlert = () => {
        document.body.removeChild(overlay);
        document.body.removeChild(alertBox);
    };
    
    overlay.onclick = closeAlert;
    setTimeout(closeAlert, 4000);
}

// Load templates from S3 and populate the dropdown
async function loadTemplatesFromS3() {
    const selector = document.getElementById('templateSelector');
    try {
        const response = await fetch('/list-templates');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        // Remove the loading placeholder
        selector.innerHTML = '';

        data.templates.forEach((t, i) => {
            const option = document.createElement('option');
            option.value = t.key;
            option.textContent = t.displayName;
            if (i === 0) option.selected = true;
            selector.appendChild(option);
        });

        // Always keep Custom Upload as last option
        const customOpt = document.createElement('option');
        customOpt.value = 'custom';
        customOpt.textContent = 'Custom Upload';
        selector.appendChild(customOpt);

        // Load the first template
        if (data.templates.length > 0) {
            loadTemplate(data.templates[0].key);
        }
    } catch (error) {
        console.error('Error loading templates from S3:', error);
        selector.innerHTML = '<option value="custom">Custom Upload (S3 unavailable)</option>';
    }
}

// Initialize application
window.addEventListener('load', () => {
    if (!checkAuthentication()) return;
    displayUserEmail();
    loadTemplatesFromS3();
    loadStoredData();
    startSessionMonitor();
    checkTutorialStatus();
    
    // Check user policy access authorization
    if (typeof checkUserPolicyAccess === 'function') {
        checkUserPolicyAccess();
    }
});

// Template management
async function loadTemplate(templateName) {
    try {
        const response = await fetch('/load-template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateName })
        });
        
        const data = await response.json();
        templatePath = templateName;
        templateBody = '';
        currentTemplateName = getTemplateBaseName(templateName);
        updateTemplateSuffix();
        
        displayParameters(data.parameters);
        document.getElementById('parameters').style.display = 'block';
        
        validateTemplateGuard(templateName);
    } catch (error) {
        alert('Error loading template: ' + error.message);
    }
}

async function loadTemplateWithExistingParams(templateName, existingParams) {
    try {
        const response = await fetch('/load-template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateName })
        });
        
        const data = await response.json();
        templatePath = templateName;
        templateBody = '';  // Clear template body for pre-existing templates
        currentTemplateName = getTemplateBaseName(templateName);
        updateTemplateSuffix();
        
        displayParametersWithExisting(data.parameters, existingParams);
        document.getElementById('parameters').style.display = 'block';
    } catch (error) {
        alert('Error loading template: ' + error.message);
    }
}

function getTemplateBaseName(templatePath) {
    const fileName = templatePath.split('/').pop();
    return fileName.replace(/\.(yaml|yml|json)$/i, '').replace(/_/g, '-').replace(/\./g, '-');
}

function updateTemplateSuffix() {
    const suffixElement = document.getElementById('templateSuffix');
    const deploymentMode = document.getElementById('deploymentMode').value;
    
    if (currentTemplateName && deploymentMode === 'new') {
        suffixElement.textContent = `+ "-${currentTemplateName}"`;
        suffixElement.style.display = 'inline';
    } else {
        suffixElement.style.display = 'none';
    }
    validateStackName();
}

// Basic parameter display with pagination
function displayParameters(parameters) {
    // Use the advanced parameter display function for all cases
    // to preserve dropdowns, search capabilities, and special field types
    displayParametersWithExisting(parameters, {});
}

// Event listeners setup
function validateStackName() {
    const input = document.getElementById('stackName');
    const validation = document.getElementById('stackNameValidation');
    const counter = document.getElementById('stackNameCounter');
    const deployButton = document.getElementById('deployButton');
    const deploymentMode = document.getElementById('deploymentMode').value;
    
    if (deploymentMode === 'update') {
        validation.textContent = '';
        counter.textContent = '';
        if (deployButton) {
            deployButton.disabled = false;
            deployButton.style.opacity = '1';
        }
        return true;
    }
    
    let value = input.value;
    const templateSuffix = (currentTemplateName && deploymentMode === 'new') ? `-${currentTemplateName}` : '';
    const finalName = value + templateSuffix;
    const length = finalName.length;
    
    counter.textContent = `Character count: ${length}/128`;
    counter.style.color = length > 128 ? '#dc3545' : '#666';
    
    const validPattern = /^[a-zA-Z][a-zA-Z0-9-]*$/;
    let isValid = true;
    let message = '';
    
    if (value.length === 0) {
        message = 'Stack name is required';
        isValid = false;
    } else if (!validPattern.test(value)) {
        message = 'Stack name must start with a letter and contain only letters, numbers, and hyphens';
        isValid = false;
    } else if (length > 128) {
        message = deploymentMode === 'new' ? 
            'Final stack name (with template suffix) must be 128 characters or less' : 
            'Stack name must be 128 characters or less';
        isValid = false;
    } else {
        message = deploymentMode === 'new' && templateSuffix ? 
            `✓ Final stack name will be: ${finalName}` : 
            `✓ Stack name is valid`;
    }
    
    validation.textContent = message;
    validation.style.color = isValid ? '#28a745' : '#dc3545';
    
    if (deployButton) {
        deployButton.disabled = !isValid;
        deployButton.style.opacity = isValid ? '1' : '0.5';
    }
    
    return isValid;
}

// Stack name validation
function setupEventListeners() {
    // Deployment mode change handler
    document.getElementById('deploymentMode').addEventListener('change', (e) => {
        const mode = e.target.value;
        const stackSearchGroup = document.getElementById('stackSearchGroup');
        const deleteStackGroup = document.getElementById('deleteStackGroup');
        const deployButton = document.getElementById('deployButton');
        const templateSelector = document.getElementById('templateSelector');
        const parametersDiv = document.getElementById('parameters');
        const stackActionButton = document.getElementById('stackActionButton');
        const templateGroup = templateSelector.closest('.form-group');
        
        if (mode === 'update') {
            stackSearchGroup.style.display = 'block';
            deleteStackGroup.style.display = 'none';
            templateGroup.style.display = 'block';
            deployButton.textContent = 'Update Stack';
            deployButton.style.display = 'inline-block';
            stackActionButton.textContent = 'Upload Stack';
            parametersDiv.style.display = 'block';
            // Check authorization before showing CloudForge option
            checkCloudForgeAccess().then(authorized => {
                if (authorized && !templateSelector.querySelector('option[value="cloudforge/cloudforge-ecs-deployment.yaml"]')) {
                    const option = document.createElement('option');
                    option.value = 'cloudforge/cloudforge-ecs-deployment.yaml';
                    option.textContent = 'CloudForge';
                    templateSelector.insertBefore(option, templateSelector.querySelector('option[value="custom"]'));
                }
            });
        } else if (mode === 'delete') {
            stackSearchGroup.style.display = 'none';
            deleteStackGroup.style.display = 'block';
            templateGroup.style.display = 'none';
            document.getElementById('customUpload').style.display = 'none';
            deployButton.style.display = 'none';
            parametersDiv.style.display = 'none';
            showAlert('⚠️ You\'re now entering destructive mode, we hope you know what you are doing.', 'warning');
            // Remove CloudForge option for delete mode
            const cloudforgeOption = templateSelector.querySelector('option[value="cloudforge/cloudforge-ecs-deployment.yaml"]');
            if (cloudforgeOption) {
                cloudforgeOption.remove();
            }
        } else {
            stackSearchGroup.style.display = 'none';
            deleteStackGroup.style.display = 'none';
            templateGroup.style.display = 'block';
            deployButton.textContent = 'Deploy Stack';
            deployButton.style.display = 'inline-block';
            parametersDiv.style.display = 'block';
            // Remove CloudForge option for new deployment mode
            const cloudforgeOption = templateSelector.querySelector('option[value="cloudforge/cloudforge-ecs-deployment.yaml"]');
            if (cloudforgeOption) {
                cloudforgeOption.remove();
                // Reset to default if CloudForge was selected
                if (templateSelector.value === 'cloudforge/cloudforge-ecs-deployment.yaml') {
                    templateSelector.value = 'certrotate/certrotate-lambda_1.0.2.yaml';
                    loadTemplate('certrotate/certrotate-lambda_1.0.2.yaml');
                }
            }
        }
        
        updateTemplateSuffix();
    });
    
    // Template selector change handler
    document.getElementById('templateSelector').addEventListener('change', (e) => {
        const value = e.target.value;
        if (value === 'custom') {
            document.getElementById('customUpload').style.display = 'block';
            document.getElementById('parameters').style.display = 'none';
            templateBody = '';
        } else if (value) {
            document.getElementById('customUpload').style.display = 'none';
            templateBody = '';
            loadTemplate(value);
        }
    });
}

// Initialize event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', setupEventListeners);

// Custom file upload handler
document.getElementById('templateFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('template', file);
    
    try {
        const response = await fetch('/parse-template', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        if (response.ok) {
            templatePath = file.name;
            templateBody = data.templateBody;  // Store template content in memory
            currentTemplateName = getTemplateBaseName(file.name);
            updateTemplateSuffix();
            
            displayParameters(data.parameters);
            document.getElementById('parameters').style.display = 'block';
        } else {
            alert('Error parsing template: ' + data.error);
        }
    } catch (error) {
        alert('Error parsing template: ' + error.message);
    }
});

// Close popup when clicking overlay
document.getElementById('awsConfigPopup').onclick = function(e) {
    if (e.target === this) {
        closeAwsConfig();
    }
};

// Close user policy popup when clicking overlay
if (document.getElementById('userPolicyPopup')) {
    document.getElementById('userPolicyPopup').onclick = function(e) {
        if (e.target === this) {
            closeUserPolicy();
        }
    };
}


// Guard Validation
async function validateTemplateGuard(templateName, body) {
    try {
        const payload = body ? { templateBody: body } : { templateName: templateName };
        const response = await fetch('/validate-template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) return;

        const container = document.getElementById('guardFindings');
        if (!container) return;

        if (result.totalFindings === 0) {
            window.guardPassed = true;
            container.innerHTML = '<div style="padding:10px;color:#155724;background:#d4edda;border-radius:4px;margin-top:10px;">✅ Template passed all guard rules</div>';
            container.style.display = 'block';
            return;
        }

        window.guardPassed = result.highCount === 0;

        const borderStyle = result.highCount > 0 ? 'background:#f8d7da;border:1px solid #dc3545' : 'background:#fff3cd;border:1px solid #ffc107';
        let html = `<div style="padding:10px;${borderStyle};border-radius:4px;margin-top:10px;">
            <strong>⚠️ Guard Validation: ${result.totalFindings} finding(s)</strong>
            <span style="color:#dc3545;margin-left:10px;">HIGH: ${result.highCount}</span>
            <span style="color:#856404;margin-left:10px;">MEDIUM: ${result.mediumCount}</span>
            <div style="max-height:200px;overflow-y:auto;margin-top:8px;">`;

        result.findings.forEach(f => {
            const color = f.severity === 'HIGH' ? '#dc3545' : '#856404';
            html += `<div style="padding:6px;border-bottom:1px solid #eee;font-size:13px;">
                <span style="color:${color};font-weight:bold;">[${f.severity}]</span>
                <strong>${f.resource}</strong>: ${f.message}
            </div>`;
        });

        html += '</div></div>';
        container.innerHTML = html;
        container.style.display = 'block';
    } catch (e) {
        console.error('Guard validation error:', e);
    }
}
