// AWS Configuration Management
function loadStoredData() {
    // Load AWS config
    const awsData = getStoredData('awsConfig');
    if (awsData) {
        document.getElementById('popupRegion').value = awsData.region || 'us-east-1';
        document.getElementById('popupAccountId').value = awsData.accountId || '';
        document.getElementById('popupAccessKeyId').value = awsData.accessKeyId || '';
        document.getElementById('popupSecretAccessKey').value = awsData.secretAccessKey || '';
        
        // Also populate hidden fields
        document.getElementById('region').value = awsData.region || 'us-east-1';
        document.getElementById('accountId').value = awsData.accountId || '';
        document.getElementById('accessKeyId').value = awsData.accessKeyId || '';
        document.getElementById('secretAccessKey').value = awsData.secretAccessKey || '';
        
        // Check account environment restrictions
        if (awsData.accountId) {
            checkAccountEnvironment(awsData.accountId);
        }
        
        // Trigger refresh of AWS-dependent components after a short delay
        // to ensure all DOM elements are ready
        setTimeout(() => {
            refreshAwsDependentComponents();
        }, 1000);
    }
}

function validateAwsConfigForm() {
    const region = document.getElementById('popupRegion').value;
    const accountId = document.getElementById('popupAccountId').value.trim();
    const accessKeyId = document.getElementById('popupAccessKeyId').value.trim();
    const secretAccessKey = document.getElementById('popupSecretAccessKey').value.trim();
    
    const hasCredentials = region && accessKeyId && secretAccessKey;
    const isValid = hasCredentials && accountId;
    
    const testBtn = document.getElementById('testCredentialsBtn');
    const saveBtn = document.getElementById('saveConfigBtn');
    const accountField = document.getElementById('popupAccountId');
    
    // Test button: enabled when credentials are present
    testBtn.disabled = !hasCredentials;
    testBtn.style.opacity = hasCredentials ? '1' : '0.5';
    
    // Save button: only enabled when all fields are valid (after successful test)
    saveBtn.disabled = !isValid;
    saveBtn.style.opacity = isValid ? '1' : '0.5';
    
    // Account ID field: always readonly
    accountField.readOnly = true;
    accountField.style.backgroundColor = '#f5f5f5';
    accountField.style.cursor = 'not-allowed';
    
    // Check account environment restrictions when account ID changes
    if (accountId && accountId.length >= 12) {
        checkAccountEnvironment(accountId);
    }
}

async function checkAccountEnvironment(accountId) {
    try {
        const response = await fetch('/check-account-environment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId })
        });
        
        const data = await response.json();
        if (response.ok) {
            window.accountEnvironmentType = data.environmentType;
            window.isProdAccount = data.isProd;
            window.requiresEnvironment = data.requiresEnvironment;
        }
    } catch (error) {
        console.error('Error checking account environment:', error);
    }
}

function openAwsConfig() {
    document.getElementById('awsConfigPopup').style.display = 'block';
    validateAwsConfigForm();
}

function closeAwsConfig() {
    document.getElementById('awsConfigPopup').style.display = 'none';
}

function saveAwsConfig() {
    const region = document.getElementById('popupRegion').value;
    const accountId = document.getElementById('popupAccountId').value;
    const accessKeyId = document.getElementById('popupAccessKeyId').value;
    const secretAccessKey = document.getElementById('popupSecretAccessKey').value;
    
    // Check account environment before saving
    checkAccountEnvironment(accountId);
    
    // Save to localStorage
    storeData('awsConfig', {
        region: region,
        accountId: accountId,
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
    });
    
    // Save to main form fields
    document.getElementById('region').value = region;
    document.getElementById('accountId').value = accountId;
    document.getElementById('accessKeyId').value = accessKeyId;
    document.getElementById('secretAccessKey').value = secretAccessKey;
    
    // Close popup
    closeAwsConfig();
    showAlert('AWS configuration saved successfully!', 'success');
    
    // Refresh AWS-dependent UI components after the save message disappears
    setTimeout(() => {
        refreshAwsDependentComponents();
    }, 2500);
}

// Utility function to check if AWS credentials are available
function hasValidAwsCredentials() {
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    const region = document.getElementById('region').value;
    
    return accessKeyId && secretAccessKey && region;
}

// Function to refresh all AWS-dependent UI components
function refreshAwsDependentComponents() {
    // Check if we have valid credentials first
    if (!hasValidAwsCredentials()) {
        console.log('No valid AWS credentials found, skipping resource refresh');
        return;
    }
    
    // Clear cached AWS resources
    clearAwsResourceCache();
    
    // Reload VPC dropdowns
    const vpcSelects = document.querySelectorAll('select[id^="param-"][id*="VPC"], select[id^="param-"][id*="vpc"]');
    vpcSelects.forEach(select => {
        const paramKey = select.id.replace('param-', '');
        const currentValue = select.value;
        select.innerHTML = '<option value="">Loading VPCs...</option>';
        setTimeout(() => loadVpcs(paramKey, currentValue), 100);
    });
    
    // Reload Lambda layer dropdowns
    const layerSelects = document.querySelectorAll('select[id^="layer-selector-"]');
    layerSelects.forEach(select => {
        const paramKey = select.id.replace('layer-selector-', '');
        const currentValue = document.getElementById(`param-${paramKey}`).value;
        select.innerHTML = '<option value="">Loading layers...</option>';
        setTimeout(() => loadLambdaLayers(paramKey, currentValue), 200);
    });
    
    // Reload RDS instances
    const rdsInputs = document.querySelectorAll('input[id^="param-"][id*="Database"], input[id^="param-"][id*="dbidentifier"]');
    rdsInputs.forEach(input => {
        const paramKey = input.id.replace('param-', '');
        setTimeout(() => loadRdsInstances(paramKey), 300);
    });
    
    // Reload IAM roles
    const roleInputs = document.querySelectorAll('input[id^="param-"][id*="Role"], input[id^="param-"][id*="role"]');
    roleInputs.forEach(input => {
        const paramKey = input.id.replace('param-', '');
        if (paramKey === 'VenafiRoleArn') {
            setTimeout(() => loadIamRoles(paramKey), 400);
        } else if (paramKey.toLowerCase().includes('role') && paramKey !== 'VenafiRoleArn') {
            setTimeout(() => loadIamRolesForParam(paramKey), 400);
        }
    });
    
    // Reload Secrets Manager secrets
    const secretInputs = document.querySelectorAll('input[id^="param-"][id*="Secret"], input[id^="param-"][id*="secret"]');
    secretInputs.forEach(input => {
        const paramKey = input.id.replace('param-', '');
        setTimeout(() => loadSecretsManagerSecrets(paramKey), 500);
    });
    
    // Show completion message after all resources are loaded
    setTimeout(() => {
        showAlert('AWS resources refreshed successfully!', 'success');
    }, 1000);
}

// Function to clear cached AWS resources
function clearAwsResourceCache() {
    // Clear all cached AWS resources from global variables
    Object.keys(window).forEach(key => {
        if (key.startsWith('roles_') || 
            key.startsWith('rdsInstances_') || 
            key.startsWith('iamRoles_') || 
            key.startsWith('secrets_')) {
            delete window[key];
        }
    });
}

function clearAwsConfig() {
    document.getElementById('popupRegion').value = 'us-east-1';
    document.getElementById('popupAccountId').value = '';
    document.getElementById('popupAccessKeyId').value = '';
    document.getElementById('popupSecretAccessKey').value = '';
    
    // Clear from localStorage
    localStorage.removeItem('awsConfig');
    
    // Clear hidden fields
    document.getElementById('region').value = '';
    document.getElementById('accountId').value = '';
    document.getElementById('accessKeyId').value = '';
    document.getElementById('secretAccessKey').value = '';
    
    // Clear AWS resource cache and reset dropdowns
    clearAwsResourceCache();
    resetAwsDependentComponents();
    
    // Re-validate form to update button states
    validateAwsConfigForm();
}

// Function to reset AWS-dependent components to initial state
function resetAwsDependentComponents() {
    // Reset VPC dropdowns
    const vpcSelects = document.querySelectorAll('select[id^="param-"][id*="VPC"], select[id^="param-"][id*="vpc"]');
    vpcSelects.forEach(select => {
        select.innerHTML = '<option value="">Configure AWS credentials first</option>';
    });
    
    // Reset subnet checkboxes
    const subnetContainers = document.querySelectorAll('[id^="subnet-checkboxes-"]');
    subnetContainers.forEach(container => {
        container.innerHTML = '<div style="color: #666; font-style: italic;">Configure AWS credentials first</div>';
    });
    
    // Reset Lambda layer dropdowns
    const layerSelects = document.querySelectorAll('select[id^="layer-selector-"]');
    layerSelects.forEach(select => {
        select.innerHTML = '<option value="">Configure AWS credentials first</option>';
    });
    
    // Clear dropdown contents for other AWS resources
    const dropdowns = document.querySelectorAll('[id$="-dropdown"]');
    dropdowns.forEach(dropdown => {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
    });
}

async function testCredentialsFromPopup() {
    const region = document.getElementById('popupRegion').value;
    const accessKeyId = document.getElementById('popupAccessKeyId').value;
    const secretAccessKey = document.getElementById('popupSecretAccessKey').value;
    
    if (!accessKeyId || !secretAccessKey) {
        showAlert('Please enter AWS credentials first', 'warning');
        return;
    }
    
    try {
        let decodedAccessKey, decodedSecretKey;
        try {
            decodedAccessKey = atob(accessKeyId);
            decodedSecretKey = atob(secretAccessKey);
        } catch (e) {
            showAlert('Invalid base64 encoding in credentials', 'error');
            return;
        }
        
        const response = await fetch('/test-credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                region,
                accessKeyId: decodedAccessKey,
                secretAccessKey: decodedSecretKey
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            // Auto-populate Account ID
            document.getElementById('popupAccountId').value = data.account;
            validateAwsConfigForm();
            showAlert(`Credentials valid! Account: ${data.account}, User: ${data.user}`, 'success');
        } else {
            showAlert('Credentials invalid: ' + data.error, 'error');
        }
    } catch (error) {
        showAlert('Error testing credentials: ' + error.message, 'error');
    }
}