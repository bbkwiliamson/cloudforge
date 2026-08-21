// Stack Operations Module
async function deployStack() {
    const stackNameInput = document.getElementById('stackName');
    let stackName = stackNameInput.value.trim();
    const deploymentMode = document.getElementById('deploymentMode').value;
    
    // Only append template name for new deployments, not updates
    if (deploymentMode === 'new') {
        if (!validateStackName()) {
            showAlert('Please fix stack name validation errors before deploying.', 'warning');
            return;
        }
        
        if (currentTemplateName && !stackName.endsWith('-' + currentTemplateName)) {
            stackName = stackName + '-' + currentTemplateName;
            stackNameInput.value = stackName;
            
            if (!validateStackName()) {
                showAlert('Stack name too long after appending template name. Please shorten your stack name.', 'warning');
                return;
            }
        }
    } else {
        if (!stackName) {
            showAlert('Please provide the exact stack name to update.', 'warning');
            return;
        }
    }
    
    const region = document.getElementById('region').value;
    const accountId = document.getElementById('accountId').value;
    
    if (!stackName || !accountId) {
        showAlert('Please configure AWS account and provide stack name', 'warning');
        return;
    }
    
    // Block deployment if guard HIGH findings exist
    if (window.guardPassed === false) {
        showAlert('Please remediate the Guard rules HIGH RISK findings in order to proceed', 'error');
        return;
    }
    
    // Only validate parameters if there are any
    if (parameterGroups.length > 0) {
        const allInputs = document.querySelectorAll('[id^="param-"]');
        for (let input of allInputs) {
            if (!input.value.trim()) {
                showAlert('Please fill in all parameters before deploying.', 'warning');
                return;
            }
        }
    }
    
    // Show deployment confirmation popup
    showDeploymentConfirmation(stackName, deploymentMode);
}

function showDeploymentConfirmation(stackName, deploymentMode) {
    document.getElementById('deployStackNameDisplay').textContent = `"${stackName}"`;
    document.getElementById('deployActionText').textContent = deploymentMode === 'update' ? 
        'You\'re about to update this stack:' : 'You\'re about to deploy this stack:';
    
    // Check if environment selection is required
    const requiresEnv = window.requiresEnvironment !== false;
    const deployEnvGroup = document.getElementById('deployEnvironmentGroup');
    const deployRteGroup = document.getElementById('deployRteGroup');
    
    if (!requiresEnv) {
        // Hide RTE and environment fields for non-PROD accounts
        if (deployRteGroup) {
            deployRteGroup.style.display = 'none';
        }
        if (deployEnvGroup) {
            deployEnvGroup.style.display = 'none';
        }
        document.getElementById('deployEnvironment').value = 'NON-PROD';
        document.getElementById('deployCrqField').style.display = 'none';
    } else {
        // Show RTE and environment fields for PROD accounts
        if (deployRteGroup) {
            deployRteGroup.style.display = 'block';
        }
        if (deployEnvGroup) {
            deployEnvGroup.style.display = 'block';
        }
        // Update environment options based on account restrictions
        updateDeployEnvironmentOptions();
        // Reset selections
        document.getElementById('deployRte').value = '';
        document.getElementById('deployEnvironment').value = '';
        document.getElementById('deployEnvironment').disabled = true;
        document.getElementById('deployCrqField').style.display = 'none';
    }
    
    document.getElementById('deployCrqId').value = '';
    
    // Validate form to disable button initially
    validateDeployForm();
    
    document.getElementById('deployConfirmPopup').style.display = 'block';
}

function updateDeployEnvironmentOptions() {
    const environmentSelect = document.getElementById('deployEnvironment');
    
    let options = `
        <option value="">Select Environment</option>
        <option value="DEV">DEV Account</option>
        <option value="SIT">SIT Account</option>
        <option value="PROD">PROD Account</option>
    `;
    
    if (window.accountEnvironmentType === 'prod_only') {
        options = `
            <option value="">Select Environment</option>
            <option value="PROD">PROD Account</option>
        `;
    } else if (window.accountEnvironmentType === 'dev_sit_only') {
        options = `
            <option value="">Select Environment</option>
            <option value="DEV">DEV Account</option>
            <option value="SIT">SIT Account</option>
        `;
    }
    
    environmentSelect.innerHTML = options;
}

function toggleDeployCrqField() {
    const environment = document.getElementById('deployEnvironment').value;
    const crqField = document.getElementById('deployCrqField');
    const crqInput = document.getElementById('deployCrqId');
    
    if (environment === 'PROD') {
        crqField.style.display = 'block';
        crqInput.disabled = true;
        crqInput.style.backgroundColor = '#f5f5f5';
        crqInput.style.color = '#666';
        crqInput.placeholder = 'Please wait, a CRQ is being created...';
        
        showCrqCreationMessage();
        createCrqForDeployment();
    } else {
        crqField.style.display = 'none';
        crqInput.value = '';
        crqInput.disabled = false;
        crqInput.style.backgroundColor = '';
        crqInput.style.color = '';
        document.getElementById('deployCrqValidation').textContent = '';
        hideCrqCreationMessage();
    }
    validateDeployForm();
}

function toggleDeployEnvironmentField() {
    const rte = document.getElementById('deployRte').value.trim();
    const environmentSelect = document.getElementById('deployEnvironment');
    
    if (rte) {
        environmentSelect.disabled = false;
        environmentSelect.style.backgroundColor = '';
        environmentSelect.style.color = '';
    } else {
        environmentSelect.disabled = true;
        environmentSelect.value = '';
        environmentSelect.style.backgroundColor = '#f5f5f5';
        environmentSelect.style.color = '#666';
        document.getElementById('deployCrqField').style.display = 'none';
        document.getElementById('deployCrqId').value = '';
    }
    validateDeployForm();
}

function validateDeployForm() {
    const rte = document.getElementById('deployRte').value.trim();
    const environment = document.getElementById('deployEnvironment').value;
    const crqId = document.getElementById('deployCrqId').value.trim();
    const confirmBtn = document.getElementById('confirmDeployBtn');
    const requiresEnv = window.requiresEnvironment !== false;
    
    if (window.guardPassed === false) {
        confirmBtn.disabled = true;
        return;
    }
    
    if (!requiresEnv) {
        confirmBtn.disabled = false;
    } else if (environment === 'PROD') {
        confirmBtn.disabled = !rte || !environment || !crqId || crqId.length < 15;
    } else {
        confirmBtn.disabled = !rte || !environment;
    }
}

function closeDeployConfirm() {
    document.getElementById('deployConfirmPopup').style.display = 'none';
    document.getElementById('deployRte').value = '';
    document.getElementById('deployEnvironment').value = '';
    document.getElementById('deployEnvironment').disabled = true;
    document.getElementById('deployCrqId').value = '';
    document.getElementById('deployCrqField').style.display = 'none';
    document.getElementById('deployCrqValidation').textContent = '';
    hideCrqCreationMessage();
}

async function executeStackDeployment() {
    const rte = document.getElementById('deployRte').value.trim();
    const environment = document.getElementById('deployEnvironment').value;
    const deploymentMode = document.getElementById('deploymentMode').value;
    const requiresEnv = window.requiresEnvironment !== false;
    
    if (requiresEnv && (!rte || !environment)) {
        showAlert('Please select both RTE and environment', 'warning');
        return;
    }
    
    const stackName = document.getElementById('stackName').value.trim();
    const region = document.getElementById('region').value;
    const accountId = document.getElementById('accountId').value;
    
    const userInfo = localStorage.getItem('userInfo');
    let userData = null;
    if (userInfo) {
        try {
            userData = JSON.parse(userInfo).data;
        } catch (e) {
            showAlert('Session expired. Please login again.', 'error');
            setTimeout(() => window.location.href = 'login.html', 2000);
            return;
        }
    }
    
    // Collect parameters
    const parameters = {};
    const paramInputs = document.querySelectorAll('[id^="param-"]');
    paramInputs.forEach(input => {
        const key = input.id.replace('param-', '');
        parameters[key] = input.value;
    });
    
    try {
        const endpoint = deploymentMode === 'update' ? '/update-stack' : '/deploy';
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stackName,
                templatePath: templateBody ? null : templatePath,
                templateBody: templateBody || null,
                parameters,
                region,
                accountId,
                userEmail: userData?.email || 'unknown',
                rteEmail: rte || null,
                environment: environment || 'NON-PROD',
                crqId: environment === 'PROD' ? document.getElementById('deployCrqId').value.trim() : null
            })
        });
        
        const result = await response.json();
        closeDeployConfirm();
        
        const resultDiv = document.getElementById('result');
        if (response.ok) {
            let successMessage = `<p style="color: green;">${result.message}</p>`;
            
            if (result.changeId) {
                successMessage += `<p style="color: #6f42c1; margin-top: 10px; font-weight: bold;">📋 ITSM Change Request Created: ${result.changeId}</p>`;
                successMessage += `<p style="font-size: 12px; color: #666;">View in ITSM: <a href="https://itsmweb.standardbank.co.za/arsys/forms/itsmweb.standardbank.co.za/CHG%3AChangeInterface/Default%20Administrator%20View/?mode=search&F304255610=%3D%22${result.changeId}%22" target="_blank" style="color: #6f42c1; text-decoration: underline;">Open Change Request</a></p>`;
                successMessage += `<p style="font-size: 12px; color: #28a745; font-style: italic;">✓ ITSM Change Request will be automatically updated to 'Implemented' status</p>`;
            } else if (environment === 'PROD') {
                successMessage += `<p style="color: #fd7e14; margin-top: 10px;">⚠️ ITSM Change Request creation failed - please create manually</p>`;
            }
            
            successMessage += `<p style="color: #007cba; margin-top: 10px; font-style: italic;">🔍 Opening stack monitoring window...</p>`;
            
            resultDiv.innerHTML = successMessage;
            
            // Start monitoring stack status in popup
            openStackMonitoringDialog(stackName, region, accountId, deploymentMode);
            
            setTimeout(() => {
                resultDiv.innerHTML = '';
            }, 10000);
            
        } else {
            if (result.requiresRollback) {
                resultDiv.innerHTML = `<p style="color: #fd7e14;">⚠️ Stack is in a failed state and cannot be updated. You must delete it first. Opening stack details...</p>`;
                
                setTimeout(() => {
                    openStackMonitoringDialog(result.stackName, region, accountId, 'rollback');
                    resultDiv.innerHTML = '';
                }, 2000);
            } else {
                resultDiv.innerHTML = `<p style="color: red;">Error: ${result.error}</p>`;
                setTimeout(() => {
                    resultDiv.innerHTML = '';
                }, 15000);
            }
        }
    } catch (error) {
        closeDeployConfirm();
        showAlert('Error: ' + error.message, 'error');
    }
}

// Stack search and update functions
async function searchStack() {
    const stackName = document.getElementById('stackSearchName').value;
    const region = document.getElementById('region').value;
    const accountId = document.getElementById('accountId').value;
    const templateSelector = document.getElementById('templateSelector');
    
    if (!stackName || !accountId) {
        showAlert('Please provide stack name and configure AWS account', 'warning');
        return;
    }
    
    if (!templatePath) {
        showAlert('Please select a template first', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/search-stack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stackName,
                region,
                accountId
            })
        });
        
        const stackData = await response.json();
        if (!response.ok) {
            showAlert('Error: ' + stackData.error, 'error');
            return;
        }
        
        // Get the selected template's parameters
        let templateData;
        if (templateSelector.value === 'custom') {
            if (!templateBody) {
                showAlert('Please upload a template file first', 'warning');
                return;
            }
            const formData = new FormData();
            const blob = new Blob([templateBody], { type: 'text/plain' });
            formData.append('template', blob, 'template.yaml');
            const templateResponse = await fetch('/parse-template', {
                method: 'POST',
                body: formData
            });
            templateData = await templateResponse.json();
            if (!templateResponse.ok) {
                showAlert('Error parsing template: ' + templateData.error, 'error');
                return;
            }
        } else {
            const templateResponse = await fetch('/load-template', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templateName: templateSelector.value })
            });
            templateData = await templateResponse.json();
            if (!templateResponse.ok) {
                showAlert('Error loading template: ' + templateData.error, 'error');
                return;
            }
        }
        
        document.getElementById('stackName').value = stackName;
        displayParametersWithExisting(templateData.parameters, stackData.parameters);
        showAlert('Stack found! Template parameters loaded with existing stack values.', 'success');
    } catch (error) {
        showAlert('Error searching stack: ' + error.message, 'error');
    }
}

// Stack filtering functions
let stackFilterTimeout;
async function filterStacks() {
    const input = document.getElementById('stackSearchName');
    const dropdown = document.getElementById('stack-dropdown');
    const query = input.value.trim();
    
    if (query.length < 2) {
        dropdown.style.display = 'none';
        return;
    }
    
    if (stackFilterTimeout) {
        clearTimeout(stackFilterTimeout);
    }
    
    stackFilterTimeout = setTimeout(async () => {
        const region = document.getElementById('region').value;
        const accountId = document.getElementById('accountId').value;
        
        if (!accountId) {
            dropdown.innerHTML = '<div style="padding: 8px; color: #666;">Configure AWS account first</div>';
            dropdown.style.display = 'block';
            return;
        }
        
        try {
            dropdown.innerHTML = '<div style="padding: 8px; color: #666;">Searching stacks...</div>';
            dropdown.style.display = 'block';
            
            const response = await fetch('/list-stacks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query,
                    region,
                    accountId
                })
            });
            
            const data = await response.json();
            if (response.ok) {
                if (data.stacks.length === 0) {
                    dropdown.innerHTML = '<div style="padding: 8px; color: #666;">No matching stacks found</div>';
                } else {
                    dropdown.innerHTML = data.stacks.map(stack => 
                        `<div onclick="selectStack('${stack.name}')" style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">
                            <strong>${stack.name}</strong><br>
                            <small style="color: #666;">${stack.status}</small>
                        </div>`
                    ).join('');
                }
            } else {
                dropdown.innerHTML = '<div style="padding: 8px; color: #dc3545;">Error: ' + data.error + '</div>';
            }
        } catch (error) {
            dropdown.innerHTML = '<div style="padding: 8px; color: #dc3545;">Error: ' + error.message + '</div>';
        }
    }, 500);
}

function selectStack(stackName) {
    document.getElementById('stackSearchName').value = stackName;
    document.getElementById('stack-dropdown').style.display = 'none';
}

// Delete stack functions
let deleteFilterTimeout;
async function filterDeleteStacks() {
    const input = document.getElementById('deleteStackName');
    const dropdown = document.getElementById('delete-stack-dropdown');
    const query = input.value.trim();
    
    if (query.length < 2) {
        dropdown.style.display = 'none';
        return;
    }
    
    if (deleteFilterTimeout) {
        clearTimeout(deleteFilterTimeout);
    }
    
    deleteFilterTimeout = setTimeout(async () => {
        const region = document.getElementById('region').value;
        const accountId = document.getElementById('accountId').value;
        
        if (!accountId) {
            dropdown.innerHTML = '<div style="padding: 8px; color: #666;">Configure AWS account first</div>';
            dropdown.style.display = 'block';
            return;
        }
        
        try {
            dropdown.innerHTML = '<div style="padding: 8px; color: #666;">Searching stacks...</div>';
            dropdown.style.display = 'block';
            
            const response = await fetch('/list-stacks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query,
                    region,
                    accountId
                })
            });
            
            const data = await response.json();
            if (response.ok) {
                if (data.stacks.length === 0) {
                    dropdown.innerHTML = '<div style="padding: 8px; color: #666;">No matching stacks found</div>';
                } else {
                    dropdown.innerHTML = data.stacks.map(stack => 
                        `<div onclick="selectDeleteStack('${stack.name}')" style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">
                            <strong>${stack.name}</strong><br>
                            <small style="color: #666;">${stack.status}</small>
                        </div>`
                    ).join('');
                }
            } else {
                dropdown.innerHTML = '<div style="padding: 8px; color: #dc3545;">Error: ' + data.error + '</div>';
            }
        } catch (error) {
            dropdown.innerHTML = '<div style="padding: 8px; color: #dc3545;">Error: ' + error.message + '</div>';
        }
    }, 500);
}

function selectDeleteStack(stackName) {
    document.getElementById('deleteStackName').value = stackName;
    document.getElementById('delete-stack-dropdown').style.display = 'none';
}

async function confirmDeleteStack() {
    const stackName = document.getElementById('deleteStackName').value.trim();
    if (!stackName) {
        showAlert('Please select a stack to delete', 'warning');
        return;
    }
    
    const region = document.getElementById('region').value;
    const accountId = document.getElementById('accountId').value;
    
    if (!accountId) {
        showAlert('Please configure AWS account', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/stack-details', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stackName,
                region,
                accountId
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            showDeleteConfirmation(data);
        } else {
            showAlert('Error getting stack details: ' + data.error, 'error');
        }
    } catch (error) {
        showAlert('Error: ' + error.message, 'error');
    }
}

function showDeleteConfirmation(stackDetails) {
    document.getElementById('deleteStackNameDisplay').textContent = `"${stackDetails.stackName}"`;
    document.getElementById('stackCreationDate').textContent = `Created: ${new Date(stackDetails.creationTime).toLocaleString()}`;
    document.getElementById('stackLastUpdate').textContent = `Last Updated: ${new Date(stackDetails.lastUpdatedTime).toLocaleString()}`;
    document.getElementById('stackResourceCount').textContent = `Total Resources: ${stackDetails.resourceCount}`;
    
    let servicesHtml = '<p><strong>Services:</strong></p><ul>';
    for (const [service, count] of Object.entries(stackDetails.services)) {
        servicesHtml += `<li>${service}: ${count} resource${count > 1 ? 's' : ''}</li>`;
    }
    servicesHtml += '</ul>';
    document.getElementById('stackServices').innerHTML = servicesHtml;
    
    // Check if environment selection is required
    const requiresEnv = window.requiresEnvironment !== false;
    const deleteEnvGroup = document.getElementById('deleteEnvironmentGroup');
    const deleteRteGroup = document.getElementById('deleteRteGroup');
    
    if (!requiresEnv) {
        // Hide RTE and environment fields for non-PROD accounts
        if (deleteRteGroup) {
            deleteRteGroup.style.display = 'none';
        }
        if (deleteEnvGroup) {
            deleteEnvGroup.style.display = 'none';
        }
        document.getElementById('deleteEnvironment').value = 'NON-PROD';
        document.getElementById('deleteCrqField').style.display = 'none';
    } else {
        // Show RTE and environment fields for PROD accounts
        if (deleteRteGroup) {
            deleteRteGroup.style.display = 'block';
        }
        if (deleteEnvGroup) {
            deleteEnvGroup.style.display = 'block';
        }
        updateDeleteEnvironmentOptions();
        document.getElementById('deleteRte').value = '';
        document.getElementById('deleteEnvironment').value = '';
        document.getElementById('deleteEnvironment').disabled = true;
        document.getElementById('deleteCrqField').style.display = 'none';
    }
    
    document.getElementById('deleteCrqId').value = '';
    validateDeleteForm();
    
    document.getElementById('deleteConfirmPopup').style.display = 'block';
}

function updateDeleteEnvironmentOptions() {
    const environmentSelect = document.getElementById('deleteEnvironment');
    
    let options = `
        <option value="">Select Environment</option>
        <option value="DEV">DEV Account</option>
        <option value="SIT">SIT Account</option>
        <option value="PROD">PROD Account</option>
    `;
    
    if (window.accountEnvironmentType === 'prod_only') {
        options = `
            <option value="">Select Environment</option>
            <option value="PROD">PROD Account</option>
        `;
    } else if (window.accountEnvironmentType === 'dev_sit_only') {
        options = `
            <option value="">Select Environment</option>
            <option value="DEV">DEV Account</option>
            <option value="SIT">SIT Account</option>
        `;
    }
    
    environmentSelect.innerHTML = options;
}

function toggleDeleteCrqField() {
    const environment = document.getElementById('deleteEnvironment').value;
    const crqField = document.getElementById('deleteCrqField');
    const crqInput = document.getElementById('deleteCrqId');
    
    if (environment === 'PROD') {
        crqField.style.display = 'block';
        crqInput.disabled = true;
        crqInput.style.backgroundColor = '#f5f5f5';
        crqInput.style.color = '#666';
        crqInput.placeholder = 'Please wait, a CRQ is being created...';
        
        showCrqCreationMessage();
        createCrqForDeletion();
    } else {
        crqField.style.display = 'none';
        crqInput.value = '';
        crqInput.disabled = false;
        crqInput.style.backgroundColor = '';
        crqInput.style.color = '';
        document.getElementById('deleteCrqValidation').textContent = '';
        hideCrqCreationMessage();
    }
    validateDeleteForm();
}

function toggleDeleteEnvironmentField() {
    const rte = document.getElementById('deleteRte').value.trim();
    const environmentSelect = document.getElementById('deleteEnvironment');
    
    if (rte) {
        environmentSelect.disabled = false;
        environmentSelect.style.backgroundColor = '';
        environmentSelect.style.color = '';
    } else {
        environmentSelect.disabled = true;
        environmentSelect.value = '';
        environmentSelect.style.backgroundColor = '#f5f5f5';
        environmentSelect.style.color = '#666';
        document.getElementById('deleteCrqField').style.display = 'none';
        document.getElementById('deleteCrqId').value = '';
    }
    validateDeleteForm();
}

function validateDeleteForm() {
    const rte = document.getElementById('deleteRte').value.trim();
    const environment = document.getElementById('deleteEnvironment').value;
    const crqId = document.getElementById('deleteCrqId').value.trim();
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const requiresEnv = window.requiresEnvironment !== false;
    
    if (!requiresEnv) {
        // Non-PROD accounts don't need RTE or environment selection
        confirmBtn.disabled = false;
    } else if (environment === 'PROD') {
        confirmBtn.disabled = !rte || !environment || !crqId || crqId.length < 15;
    } else {
        confirmBtn.disabled = !rte || !environment;
    }
}

function closeDeleteConfirm() {
    document.getElementById('deleteConfirmPopup').style.display = 'none';
    document.getElementById('deleteRte').value = '';
    document.getElementById('deleteEnvironment').value = '';
    document.getElementById('deleteEnvironment').disabled = true;
    document.getElementById('deleteCrqId').value = '';
    document.getElementById('deleteCrqField').style.display = 'none';
    document.getElementById('deleteCrqValidation').textContent = '';
}

async function executeStackDeletion() {
    const rte = document.getElementById('deleteRte').value.trim();
    const environment = document.getElementById('deleteEnvironment').value;
    const crqId = document.getElementById('deleteCrqId').value.trim();
    const requiresEnv = window.requiresEnvironment !== false;
    
    if (requiresEnv && (!rte || !environment)) {
        showAlert('Please select both RTE and environment', 'warning');
        return;
    }
    
    if (environment === 'PROD' && !crqId) {
        showAlert('CRQ ID is required for PROD environment', 'warning');
        return;
    }
    
    if (environment === 'PROD' && crqId) {
        const isValidCrq = crqId.toLowerCase().startsWith('crq');
        const isValidUrl = crqId.startsWith('https://sbsagroup.atlassian.net/');
        const isValidLength = crqId.length >= 15;
        if (!(isValidCrq || isValidUrl) || !isValidLength) {
            showAlert('Please enter a valid CRQ', 'warning');
            return;
        }
    }
    
    const stackName = document.getElementById('deleteStackName').value.trim();
    const region = document.getElementById('region').value;
    const accountId = document.getElementById('accountId').value;
    
    const userInfo = localStorage.getItem('userInfo');
    let userData = null;
    if (userInfo) {
        try {
            userData = JSON.parse(userInfo).data;
        } catch (e) {
            showAlert('Session expired. Please login again.', 'error');
            setTimeout(() => window.location.href = 'login.html', 2000);
            return;
        }
    }
    
    try {
        const response = await fetch('/delete-stack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                stackName,
                region,
                accountId,
                userEmail: userData?.email || 'unknown',
                rteEmail: rte || null,
                environment: environment || 'NON-PROD',
                crqId: environment === 'PROD' ? crqId : null
            })
        });
        
        const result = await response.json();
        closeDeleteConfirm();
        
        const resultDiv = document.getElementById('result');
        if (response.ok) {
            let successMessage = `<p style="color: green;">${result.message}</p>`;
            
            if (result.changeId) {
                successMessage += `<p style="color: #6f42c1; margin-top: 10px; font-weight: bold;">📋 ITSM Change Request Created: ${result.changeId}</p>`;
                successMessage += `<p style="font-size: 12px; color: #666;">View in ITSM: <a href="https://itsmweb.standardbank.co.za/arsys/forms/itsmweb.standardbank.co.za/CHG%3AChangeInterface/Default%20Administrator%20View/?mode=search&F304255610=%3D%22${result.changeId}%22" target="_blank" style="color: #6f42c1; text-decoration: underline;">Open Change Request</a></p>`;
                successMessage += `<p style="font-size: 12px; color: #28a745; font-style: italic;">✓ ITSM Change Request will be automatically updated to 'Implemented' status</p>`;
            } else if (environment === 'PROD') {
                successMessage += `<p style="color: #fd7e14; margin-top: 10px;">⚠️ ITSM Change Request creation failed - please create manually</p>`;
            }
            
            successMessage += `<p style="color: #007cba; margin-top: 10px; font-style: italic;">🔍 Opening stack monitoring window...</p>`;
            
            resultDiv.innerHTML = successMessage;
            
            // Start monitoring stack deletion status in popup
            openStackMonitoringDialog(stackName, region, accountId, 'delete');
            
            setTimeout(() => {
                resultDiv.innerHTML = '';
            }, 10000);
            
            document.getElementById('deleteStackName').value = '';
        } else {
            resultDiv.innerHTML = `<p style="color: red;">Error: ${result.error}</p>`;
        }
        
        setTimeout(() => {
            resultDiv.innerHTML = '';
        }, 30000);
    } catch (error) {
        closeDeleteConfirm();
        showAlert('Error: ' + error.message, 'error');
    }
}


// Stack List Feature
let _stackListData = [];

async function openStackList() {
    const region = document.getElementById('region').value;
    const accountId = document.getElementById('accountId').value;

    if (!region || !accountId) {
        showAlert('Please configure AWS account first using AWS Connect', 'warning');
        return;
    }

    document.getElementById('stackListTitle').textContent = `AWS Stack List for region: ${region}`;
    document.getElementById('stackListContent').innerHTML = '<div style="text-align: center; padding: 20px;"><div class="spinner"></div><p>Loading stacks...</p></div>';
    document.getElementById('stackListSearch').value = '';
    document.getElementById('stackListPopup').style.display = 'block';

    try {
        const response = await fetch('/list-stacks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ region, accountId, query: '' })
        });

        const data = await response.json();
        if (response.ok && data.stacks) {
            _stackListData = data.stacks;
            renderStackList(_stackListData);
        } else {
            document.getElementById('stackListContent').innerHTML = `<p style="color: red;">Error: ${data.error || 'Failed to load stacks'}</p>`;
        }
    } catch (error) {
        document.getElementById('stackListContent').innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    }
}

function filterStackList() {
    const query = document.getElementById('stackListSearch').value.toLowerCase();
    const filtered = _stackListData.filter(stack => stack.name.toLowerCase().includes(query));
    renderStackList(filtered);
}

function renderStackList(stacks) {
    let html = `<p style="margin-bottom: 10px; color: #666;">Found ${stacks.length} stack(s)</p>`;
    stacks.forEach((stack, index) => {
        const statusColor = stack.status.includes('COMPLETE') && !stack.status.includes('ROLLBACK') ? '#28a745' : '#dc3545';
        html += `<div style="margin: 5px 0; border: 1px solid #ddd; border-radius: 4px; background: #f9f9f9;">
            <div onclick="toggleStackResources(${index}, '${stack.name}')" style="padding: 10px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                <strong>${stack.name}</strong>
                <span style="color: ${statusColor}; font-size: 12px;">${stack.status}</span>
            </div>
            <div id="stackResources-${index}" style="display: none; padding: 10px; border-top: 1px solid #ddd; background: white;"></div>
        </div>`;
    });
    document.getElementById('stackListContent').innerHTML = html;
}

async function toggleStackResources(index, stackName) {
    const div = document.getElementById(`stackResources-${index}`);
    
    if (div.style.display === 'block') {
        div.style.display = 'none';
        return;
    }

    div.innerHTML = '<p style="color: #666;">Loading resources...</p>';
    div.style.display = 'block';

    const region = document.getElementById('region').value;
    const accountId = document.getElementById('accountId').value;

    try {
        const response = await fetch('/get-stack-resources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ region, accountId, stackName })
        });

        const data = await response.json();
        if (response.ok && data.resources) {
            let html = `<div style="margin-bottom: 8px;"><button onclick="viewStackTemplate('${stackName}')" style="background: #007cba; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">📄 View Template</button></div>`;
            html += '<table style="width: 100%; font-size: 12px; border-collapse: collapse;">';
            html += '<tr style="background: #001a4d; color: white;"><th style="padding: 6px; text-align: left;">Type</th><th style="padding: 6px; text-align: left;">Logical ID</th><th style="padding: 6px; text-align: left;">Physical ID / ARN</th><th style="padding: 6px; text-align: left;">Status</th></tr>';
            data.resources.forEach(r => {
                const statusColor = r.status.includes('COMPLETE') ? '#28a745' : '#dc3545';
                html += `<tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 6px; word-break: break-all;">${r.type}</td>
                    <td style="padding: 6px;">${r.logicalId}</td>
                    <td style="padding: 6px; word-break: break-all; max-width: 250px;">${r.physicalId}</td>
                    <td style="padding: 6px; color: ${statusColor};">${r.status}</td>
                </tr>`;
            });
            html += '</table>';
            div.innerHTML = html;
        } else {
            div.innerHTML = `<p style="color: red;">Error: ${data.error || 'Failed to load resources'}</p>`;
        }
    } catch (error) {
        div.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    }
}

async function viewStackTemplate(stackName) {
    const region = document.getElementById('region').value;
    const accountId = document.getElementById('accountId').value;

    // Create popup if it doesn't exist
    if (!document.getElementById('stackTemplatePopup')) {
        document.body.insertAdjacentHTML('beforeend', `
            <div class="popup-overlay" id="stackTemplatePopup" style="display:none; z-index: 10000;">
                <div class="popup" style="width: 70%; max-width: 900px; height: 80vh; display: flex; flex-direction: column; background: rgba(255, 255, 255, 0.85); box-shadow: 0 0 60px 25px rgba(0, 124, 186, 0.4), 0 0 120px 50px rgba(0, 124, 186, 0.2), 0 0 180px 80px rgba(0, 124, 186, 0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #ddd;">
                        <h3 id="stackTemplateTitle" style="margin: 0; color: #003087;">Stack Template</h3>
                        <button onclick="closeStackTemplate()" style="background: #dc3545; border: none; color: white; font-size: 18px; cursor: pointer; border-radius: 4px; padding: 2px 8px;">&times;</button>
                    </div>
                    <div id="stackTemplateBody" style="flex: 1; overflow: auto; background: white; padding: 16px; margin: 0;">
                    </div>
                </div>
            </div>
        `);
    }

    document.getElementById('stackTemplateTitle').textContent = `Template: ${stackName}`;
    document.getElementById('stackTemplateBody').innerHTML = '<p style="color: #666;">Loading template...</p>';
    document.getElementById('stackTemplatePopup').style.display = 'block';

    try {
        const response = await fetch('/get-stack-template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ region, accountId, stackName })
        });

        const data = await response.json();
        if (response.ok && data.template) {
            const templateContent = typeof data.template === 'object' ? JSON.stringify(data.template, null, 2) : data.template;
            document.getElementById('stackTemplateBody').innerHTML = `<pre style="margin:0;color:#333;font-size:13px;font-family:monospace;white-space:pre-wrap;">${templateContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
        } else {
            document.getElementById('stackTemplateBody').innerHTML = `<p style="color: #dc3545;">Error: ${data.error || 'Failed to load template'}</p>`;
        }
    } catch (error) {
        document.getElementById('stackTemplateBody').innerHTML = `<p style="color: #dc3545;">Error: ${error.message}</p>`;
    }
}

function closeStackTemplate() {
    document.getElementById('stackTemplatePopup').style.display = 'none';
}

function closeStackList() {
    document.getElementById('stackListPopup').style.display = 'none';
}
