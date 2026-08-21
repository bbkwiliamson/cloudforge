// AWS Configuration Management
let connectionAuthorized = false;

function isDirectKeysMode() {
    const toggle = document.getElementById('authModeToggle');
    return toggle && toggle.checked;
}

function onAuthModeToggle() {
    const direct = isDirectKeysMode();
    document.getElementById('accountIdSection').style.display = direct ? 'none' : '';
    document.getElementById('credentialsSection').style.display = direct ? '' : 'none';
    connectionAuthorized = false;
    hideAccountTypeBadge();
    validateAwsConfigForm();
}

function loadStoredData() {
    const awsData = getStoredData('awsConfig');
    if (awsData) {
        document.getElementById('popupRegion').value = awsData.region || 'af-south-1';
        
        // Also populate hidden fields
        document.getElementById('region').value = awsData.region || 'af-south-1';
        document.getElementById('accountId').value = awsData.accountId || '';
        
        // Load accounts dropdown then set saved value
        loadAccountDropdown(awsData.accountId);
        
        // Check account environment restrictions
        if (awsData.accountId) {
            checkAccountEnvironment(awsData.accountId);
        }
        
        setTimeout(() => {
            refreshAwsDependentComponents();
        }, 1000);
    } else {
        loadAccountDropdown();
    }
}

async function loadAccountDropdown(selectedAccountId) {
    try {
        const response = await fetch('/get-account-list');
        const data = await response.json();
        if (response.ok && data.accounts) {
            window._accountList = data.accounts;
            renderAccountDropdown(data.accounts);
            if (selectedAccountId) {
                const match = data.accounts.find(a => a.accountId === selectedAccountId);
                if (match) {
                    document.getElementById('popupAccountId').value = match.accountId;
                    document.getElementById('accountSearchInput').value = match.description
                        ? `${match.accountId} - ${match.description} (${match.environment})`
                        : `${match.accountId} (${match.environment})`;
                }
            }
        }
    } catch (error) {
        console.error('Error loading account list:', error);
    }
    validateAwsConfigForm();
}

function renderAccountDropdown(accounts) {
    const list = document.getElementById('accountDropdownList');
    list.innerHTML = '';
    accounts.forEach(acc => {
        const item = document.createElement('div');
        item.style.cssText = 'padding:8px 12px; cursor:pointer; border-bottom:1px solid #eee; color:#333;';
        item.onmouseenter = () => item.style.background = '#e8f4fd';
        item.onmouseleave = () => item.style.background = 'transparent';
        const label = acc.description
            ? `${acc.accountId} - ${acc.description} (${acc.environment})`
            : `${acc.accountId} (${acc.environment})`;
        item.textContent = label;
        item.onclick = () => selectAccount(acc.accountId, label);
        list.appendChild(item);
    });
}

function filterAccountDropdown() {
    const query = document.getElementById('accountSearchInput').value.trim();
    const filtered = (window._accountList || []).filter(acc => {
        const label = `${acc.accountId} ${acc.description || ''} ${acc.environment}`.toLowerCase();
        return label.includes(query.toLowerCase());
    });
    
    // Only show dropdown if user has typed at least 10 characters and there are matches
    if (query.length >= 10 && filtered.length > 0) {
        renderAccountDropdown(filtered);
        toggleAccountDropdown(true);
    } else {
        toggleAccountDropdown(false);
    }

    // If input is a valid 12-digit account ID not in the list, accept it as non-prod
    if (/^\d{12}$/.test(query)) {
        document.getElementById('popupAccountId').value = query;
    } else {
        document.getElementById('popupAccountId').value = '';
    }
    connectionAuthorized = false;
    hideAccountTypeBadge();
    validateAwsConfigForm();
}

function selectAccount(accountId, label) {
    document.getElementById('popupAccountId').value = accountId;
    document.getElementById('accountSearchInput').value = label;
    toggleAccountDropdown(false);
    connectionAuthorized = false;
    hideAccountTypeBadge();
    validateAwsConfigForm();
}

function toggleAccountDropdown(show) {
    const list = document.getElementById('accountDropdownList');
    if (show === undefined) {
        // Do nothing - no manual toggle allowed
        return;
    } else {
        list.style.display = show ? 'block' : 'none';
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
    const container = document.getElementById('accountDropdownContainer');
    if (container && !container.contains(e.target)) {
        toggleAccountDropdown(false);
    }
});

function validateAwsConfigForm() {
    const testBtn = document.getElementById('testCredentialsBtn');
    const saveBtn = document.getElementById('saveConfigBtn');

    let canTest = false;
    if (isDirectKeysMode()) {
        const creds = document.getElementById('awsCredentialsInput').value.trim();
        canTest = creds.length > 0;
    } else {
        const accountId = document.getElementById('popupAccountId').value;
        canTest = accountId && accountId.length >= 12;
        if (canTest) checkAccountEnvironment(accountId);
    }

    testBtn.disabled = !canTest;
    testBtn.style.opacity = canTest ? '1' : '0.5';
    saveBtn.disabled = !connectionAuthorized;
    saveBtn.style.opacity = connectionAuthorized ? '1' : '0.5';
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

function updateAccountTypeBadge(isProd) {
    const badge = document.getElementById('accountTypeBadge');
    if (!badge) return;
    
    const accountId = document.getElementById('popupAccountId').value || document.getElementById('accountId').value;
    const accounts = window._accountList || [];
    const match = accounts.find(a => a.accountId === accountId);
    const description = match && match.description ? match.description : (isProd ? 'PROD' : 'Dev/UAT');
    
    badge.style.display = 'inline-block';
    badge.textContent = `AWS Account: ${accountId} - ${description}`;
    if (isProd) {
        badge.style.background = '#28a745';
        badge.style.color = 'white';
    } else {
        badge.style.background = '#333';
        badge.style.color = 'white';
    }
}

function openAwsConfig() {
    document.getElementById('awsConfigPopup').style.display = 'block';
    onAuthModeToggle();
    loadAccountDropdown(document.getElementById('accountId').value);
}

function closeAwsConfig() {
    document.getElementById('awsConfigPopup').style.display = 'none';
}

function saveAwsConfig() {
    const region = document.getElementById('popupRegion').value;
    const accountId = document.getElementById('popupAccountId').value;
    
    // Check account environment before saving
    checkAccountEnvironment(accountId);
    
    // Save to localStorage
    storeData('awsConfig', {
        region: region,
        accountId: accountId
    });
    
    // Save to main form fields
    document.getElementById('region').value = region;
    document.getElementById('accountId').value = accountId;
    
    // Close popup
    closeAwsConfig();
    showAlert('AWS configuration saved successfully!', 'success');
    
    setTimeout(() => {
        refreshAwsDependentComponents();
    }, 2500);
}

// Utility function to check if AWS credentials are available
function hasValidAwsCredentials() {
    const accountId = document.getElementById('accountId').value;
    const region = document.getElementById('region').value;
    
    return accountId && region;
}

// Function to refresh all AWS-dependent UI components
function refreshAwsDependentComponents() {
    if (!hasValidAwsCredentials()) {
        console.log('No valid AWS config found, skipping resource refresh');
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
    
    setTimeout(() => {
        showAlert('AWS resources refreshed successfully!', 'success');
    }, 1000);
}

// Function to clear cached AWS resources
function clearAwsResourceCache() {
    Object.keys(window).forEach(key => {
        if (key.startsWith('roles_') || 
            key.startsWith('rdsInstances_') || 
            key.startsWith('iamRoles_') || 
            key.startsWith('secrets_')) {
            delete window[key];
        }
    });
}

function hideAccountTypeBadge() {
    const badge = document.getElementById('accountTypeBadge');
    if (badge) badge.style.display = 'none';
}

function clearAwsConfig() {
    document.getElementById('popupRegion').value = 'af-south-1';
    document.getElementById('popupAccountId').value = '';
    document.getElementById('accountSearchInput').value = '';
    document.getElementById('awsCredentialsInput').value = '';
    localStorage.removeItem('awsConfig');
    document.getElementById('region').value = '';
    document.getElementById('accountId').value = '';
    connectionAuthorized = false;
    hideAccountTypeBadge();
    clearAwsResourceCache();
    resetAwsDependentComponents();
    validateAwsConfigForm();
}

// Function to reset AWS-dependent components to initial state
function resetAwsDependentComponents() {
    const vpcSelects = document.querySelectorAll('select[id^="param-"][id*="VPC"], select[id^="param-"][id*="vpc"]');
    vpcSelects.forEach(select => {
        select.innerHTML = '<option value="">Configure AWS account first</option>';
    });
    
    const subnetContainers = document.querySelectorAll('[id^="subnet-checkboxes-"]');
    subnetContainers.forEach(container => {
        container.innerHTML = '<div style="color: #666; font-style: italic;">Configure AWS account first</div>';
    });
    
    const layerSelects = document.querySelectorAll('select[id^="layer-selector-"]');
    layerSelects.forEach(select => {
        select.innerHTML = '<option value="">Configure AWS account first</option>';
    });
    
    const dropdowns = document.querySelectorAll('[id$="-dropdown"]');
    dropdowns.forEach(dropdown => {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
    });
}

async function testCredentialsFromPopup() {
    const region = document.getElementById('popupRegion').value;
    const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
    const userEmail = userInfo.data?.email || '';
    connectionAuthorized = false;

    let payload;
    if (isDirectKeysMode()) {
        const creds = document.getElementById('awsCredentialsInput').value.trim();
        if (!creds) {
            showAlert('Please enter base64 encoded credentials', 'warning');
            return;
        }
        payload = { region, credentials: creds, userEmail };
    } else {
        const accountId = document.getElementById('popupAccountId').value;
        if (!accountId || accountId.length < 12) {
            showAlert('Please enter a valid AWS Account ID (12 digits)', 'warning');
            return;
        }
        payload = { region, accountId, userEmail };
    }

    try {
        const response = await fetch('/test-credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (response.ok) {
            connectionAuthorized = true;
            // In direct-keys mode the account ID comes back from the ARN
            if (isDirectKeysMode()) {
                document.getElementById('popupAccountId').value = data.account;
                document.getElementById('accountId').value = data.account;
                checkAccountEnvironment(data.account);
            }
            validateAwsConfigForm();
            updateAccountTypeBadge(window.isProdAccount);
            showAlert(`Connection successful! Account: ${data.account}, Role: ${data.user}`, 'success');
        } else {
            validateAwsConfigForm();
            hideAccountTypeBadge();
            showAlert('Connection failed: ' + data.error, 'error');
        }
    } catch (error) {
        validateAwsConfigForm();
        hideAccountTypeBadge();
        showAlert('Error testing connection: ' + error.message, 'error');
    }
}
