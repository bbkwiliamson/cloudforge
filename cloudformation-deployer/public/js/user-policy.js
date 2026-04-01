// User Policy Management Module

let allPolicies = [];
let isUserPolicyAuthorized = false;

function getAwsConfig() {
    return {
        region: document.getElementById('region').value,
        accountId: document.getElementById('accountId').value,
        accessKeyId: atob(document.getElementById('accessKeyId').value || ''),
        secretAccessKey: atob(document.getElementById('secretAccessKey').value || '')
    };
}

async function checkUserPolicyAccess() {
    try {
        const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        const userEmail = userInfo.data?.email;
        
        if (!userEmail) {
            return false;
        }
        
        const response = await fetch('/check-cloudforge-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userEmail })
        });
        
        const data = await response.json();
        isUserPolicyAuthorized = response.ok && data.authorized;
        
        // Show/hide icon based on authorization
        const icon = document.getElementById('userPolicyIcon');
        if (icon) {
            icon.style.display = isUserPolicyAuthorized ? 'block' : 'none';
        }
        
        return isUserPolicyAuthorized;
    } catch (error) {
        console.error('Error checking user policy access:', error);
        return false;
    }
}

function openUserPolicy() {
    if (!isUserPolicyAuthorized) {
        return;
    }
    const awsConfig = getAwsConfig();
    if (!awsConfig.region || !awsConfig.accessKeyId || !awsConfig.secretAccessKey) {
        showAlert('Please configure AWS credentials first', 'error');
        return;
    }
    
    document.getElementById('userPolicyPopup').style.display = 'block';
    document.getElementById('userPolicyStatus').style.display = 'none';
    document.getElementById('userPolicyResult').style.display = 'none';
    document.getElementById('policySearch').value = '';
    document.getElementById('selectedPolicyArn').value = '';
    document.getElementById('policy-dropdown').style.display = 'none';
    
    loadIamUsers();
    loadIamPolicies();
}

function closeUserPolicy() {
    document.getElementById('userPolicyPopup').style.display = 'none';
}

async function loadIamUsers() {
    const userSelect = document.getElementById('iamUserSelect');
    userSelect.innerHTML = '<option value="">Loading users...</option>';
    
    try {
        const awsConfig = getAwsConfig();
        const response = await fetch('/iam-users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                region: awsConfig.region,
                accessKeyId: awsConfig.accessKeyId,
                secretAccessKey: awsConfig.secretAccessKey
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            userSelect.innerHTML = '<option value="">Select IAM User</option>';
            data.users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.userName;
                option.textContent = user.userName;
                userSelect.appendChild(option);
            });
        } else {
            userSelect.innerHTML = '<option value="">Error loading users</option>';
            showAlert(data.error || 'Failed to load IAM users', 'error');
        }
    } catch (error) {
        userSelect.innerHTML = '<option value="">Error loading users</option>';
        showAlert('Network error loading users', 'error');
    }
}

async function loadIamPolicies() {
    try {
        const awsConfig = getAwsConfig();
        const response = await fetch('/iam-policies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                region: awsConfig.region,
                accessKeyId: awsConfig.accessKeyId,
                secretAccessKey: awsConfig.secretAccessKey,
                query: ''
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            allPolicies = data.policies;
        } else {
            showAlert(data.error || 'Failed to load IAM policies', 'error');
        }
    } catch (error) {
        showAlert('Network error loading policies', 'error');
    }
}

function filterPolicies() {
    const searchInput = document.getElementById('policySearch');
    const dropdown = document.getElementById('policy-dropdown');
    const query = searchInput.value.toLowerCase();
    
    if (query.length < 2) {
        dropdown.style.display = 'none';
        return;
    }
    
    const filtered = allPolicies.filter(p => p.policyName.toLowerCase().includes(query));
    
    if (filtered.length === 0) {
        dropdown.style.display = 'none';
        return;
    }
    
    dropdown.innerHTML = '';
    filtered.slice(0, 20).forEach(policy => {
        const item = document.createElement('div');
        item.style.cssText = 'padding: 10px; cursor: pointer; border-bottom: 1px solid #eee;';
        item.innerHTML = `
            <strong>${policy.policyName}</strong>
            ${policy.isAWSManaged ? '<span style="color: #fd7e14; font-size: 11px; margin-left: 5px;">[AWS Managed]</span>' : '<span style="color: #28a745; font-size: 11px; margin-left: 5px;">[Customer]</span>'}
            ${policy.description ? `<br><small style="color: #666;">${policy.description}</small>` : ''}
        `;
        item.onmouseover = () => item.style.background = '#f0f8ff';
        item.onmouseout = () => item.style.background = 'white';
        item.onclick = () => selectPolicy(policy);
        dropdown.appendChild(item);
    });
    
    dropdown.style.display = 'block';
}

function selectPolicy(policy) {
    document.getElementById('policySearch').value = policy.policyName;
    document.getElementById('selectedPolicyArn').value = policy.arn;
    document.getElementById('policy-dropdown').style.display = 'none';
    validateUserPolicyForm();
}

function validateUserPolicyForm() {
    const userName = document.getElementById('iamUserSelect').value;
    const policyArn = document.getElementById('selectedPolicyArn').value;
    const attachBtn = document.getElementById('attachPolicyBtn');
    
    attachBtn.disabled = !(userName && policyArn);
}

async function attachUserPolicy() {
    const userName = document.getElementById('iamUserSelect').value;
    const policyArn = document.getElementById('selectedPolicyArn').value;
    const policyName = document.getElementById('policySearch').value;
    
    if (!userName || !policyArn) {
        showAlert('Please select both user and policy', 'error');
        return;
    }
    
    // Show loading spinner
    document.getElementById('userPolicyStatus').style.display = 'block';
    document.getElementById('userPolicyResult').style.display = 'none';
    document.getElementById('attachPolicyBtn').disabled = true;
    
    try {
        const awsConfig = getAwsConfig();
        const userInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        
        const response = await fetch('/attach-user-policy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userName,
                policyArn,
                region: awsConfig.region,
                accessKeyId: awsConfig.accessKeyId,
                secretAccessKey: awsConfig.secretAccessKey,
                userEmail: userInfo.data?.email || 'unknown',
                accountId: awsConfig.accountId
            })
        });
        
        const data = await response.json();
        
        // Hide spinner
        document.getElementById('userPolicyStatus').style.display = 'none';
        
        // Show result
        const resultDiv = document.getElementById('userPolicyResult');
        resultDiv.style.display = 'block';
        
        if (response.ok) {
            resultDiv.style.background = '#d4edda';
            resultDiv.style.color = '#155724';
            resultDiv.style.border = '1px solid #c3e6cb';
            resultDiv.innerHTML = `
                <strong>✅ Success!</strong><br>
                Policy <strong>${policyName}</strong> has been attached to user <strong>${userName}</strong>
            `;
            
            // Reset form after 3 seconds
            setTimeout(() => {
                document.getElementById('iamUserSelect').value = '';
                document.getElementById('policySearch').value = '';
                document.getElementById('selectedPolicyArn').value = '';
                resultDiv.style.display = 'none';
                validateUserPolicyForm();
            }, 3000);
        } else {
            resultDiv.style.background = '#f8d7da';
            resultDiv.style.color = '#721c24';
            resultDiv.style.border = '1px solid #f5c6cb';
            resultDiv.innerHTML = `
                <strong>❌ Failed to attach policy</strong><br>
                ${data.error || 'Unknown error occurred'}
            `;
            document.getElementById('attachPolicyBtn').disabled = false;
        }
    } catch (error) {
        document.getElementById('userPolicyStatus').style.display = 'none';
        
        const resultDiv = document.getElementById('userPolicyResult');
        resultDiv.style.display = 'block';
        resultDiv.style.background = '#f8d7da';
        resultDiv.style.color = '#721c24';
        resultDiv.style.border = '1px solid #f5c6cb';
        resultDiv.innerHTML = `
            <strong>❌ Network Error</strong><br>
            ${error.message}
        `;
        document.getElementById('attachPolicyBtn').disabled = false;
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('policy-dropdown');
    const searchInput = document.getElementById('policySearch');
    
    if (dropdown && searchInput && 
        !dropdown.contains(event.target) && 
        event.target !== searchInput) {
        dropdown.style.display = 'none';
    }
});
