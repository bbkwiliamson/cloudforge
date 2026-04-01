// Parameters Management Module
function displayParametersWithExisting(parameters, existingParams) {
    const container = document.getElementById('parameterInputs');
    container.innerHTML = '';
    
    // Handle case where parameters is null, undefined, or not an object
    if (!parameters || typeof parameters !== 'object') {
        parameters = {};
    }
    if (!existingParams || typeof existingParams !== 'object') {
        existingParams = {};
    }
    
    let paramEntries = Object.entries(parameters);
    
    // Define custom parameter order
    const paramOrder = ['GroupName', 'EnvironmentName', 'VenafiRoleArn', 'VPC', 'SubnetIds'];
    
    // Sort parameters by custom order, then alphabetically
    paramEntries.sort(([keyA], [keyB]) => {
        const indexA = paramOrder.indexOf(keyA);
        const indexB = paramOrder.indexOf(keyB);
        
        if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
        }
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return keyA.localeCompare(keyB);
    });
    
    // If no parameters, show deploy button immediately
    if (paramEntries.length === 0) {
        parameterGroups = [];
        currentGroup = 0;
        document.getElementById('deployButton').style.display = 'inline-block';
        document.getElementById('prevButton').style.display = 'none';
        document.getElementById('nextButton').style.display = 'none';
        document.getElementById('pageInfo').textContent = 'No parameters required';
        document.getElementById('stackNameGroup').style.display = 'block';
        return;
    }
    
    parameterGroups = [];
    
    for (let i = 0; i < paramEntries.length; i += 3) {
        parameterGroups.push(paramEntries.slice(i, i + 3));
    }
    
    parameterGroups.forEach((group, groupIndex) => {
        const groupDiv = document.createElement('div');
        groupDiv.className = `parameter-group ${groupIndex === 0 ? 'active' : ''}`;
        groupDiv.id = `group-${groupIndex}`;
        
        group.forEach(([key, param]) => {
            const div = document.createElement('div');
            div.className = 'parameter';
            const description = param && param.Description ? param.Description : '';
            const existingValue = existingParams[key] || '';
            // Template default takes precedence, then existing stack value, then empty
            const defaultValue = (param && param.Default) ? param.Default : existingValue;
            
            // Special handling for VPC parameters
            if (param && param.Type === 'AWS::EC2::VPC::Id' || key.toLowerCase() === 'vpc') {
                div.innerHTML = `
                    <label>${key}:</label>
                    <select id="param-${key}" required onchange="onVpcChange('${key}')">
                        <option value="">Loading VPCs...</option>
                    </select>
                `;
                // Load VPCs after creating the element
                setTimeout(() => loadVpcs(key, defaultValue), 100);
            } else if (key === 'SubnetIds' || key.toLowerCase().includes('subnet')) {
                div.innerHTML = `
                    <label>${key}:</label>
                    <input type="text" id="param-${key}" placeholder="${description}" value="${defaultValue}" required readonly>
                    <div id="subnet-checkboxes-${key}" style="max-height: 150px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; background: white;">
                        <div style="color: #666; font-style: italic;">Select VPC first</div>
                    </div>
                `;
            } else if (key === 'SNSTopic') {
                div.innerHTML = `
                    <label>${key}:</label>
                    <input type="text" id="param-${key}" placeholder="${description}" value="${defaultValue}" required oninput="validateSnsTopicName('${key}')">
                    <div id="sns-validation-${key}" style="font-size: 12px; margin-top: 5px;"></div>
                `;
            } else if (key === 'BucketName') {
                div.innerHTML = `
                    <label>${key}:</label>
                    <input type="text" id="param-${key}" placeholder="${description}" value="${defaultValue}" required oninput="validateBucketName('${key}')">
                    <div id="bucket-validation-${key}" style="font-size: 12px; margin-top: 5px;"></div>
                `;
            } else if (key === 'DatabaseIdentifier' || key.toLowerCase().includes('dbidentifier')) {
                div.innerHTML = `
                    <label>${key}:</label>
                    <div style="position: relative; display: flex; align-items: center;">
                        <input type="text" id="param-${key}" placeholder="${description}" value="${defaultValue}" required oninput="filterRdsInstances('${key}')" style="flex: 1;">
                        <button type="button" onclick="showAllRdsInstances('${key}')" style="background: #007cba; color: white; border: none; padding: 8px 12px; margin-left: 5px; border-radius: 4px; cursor: pointer; font-size: 12px;">▼</button>
                        <div id="rds-dropdown-${key}" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #ddd; border-top: none; max-height: 200px; overflow-y: auto; z-index: 8000;"></div>
                    </div>
                `;
                setTimeout(() => loadRdsInstances(key), 100);
            } else if (key === 'Role' || (key.toLowerCase().includes('role') && key !== 'VenafiRoleArn')) {
                div.innerHTML = `
                    <label>${key}:</label>
                    <div style="position: relative; display: flex; align-items: center;">
                        <input type="text" id="param-${key}" placeholder="${description}" value="${defaultValue}" required oninput="filterIamRoles('${key}')" style="flex: 1;">
                        <button type="button" onclick="showAllIamRoles('${key}')" style="background: #007cba; color: white; border: none; padding: 8px 12px; margin-left: 5px; border-radius: 4px; cursor: pointer; font-size: 12px;">▼</button>
                        <div id="role-dropdown-${key}" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #ddd; border-top: none; max-height: 200px; overflow-y: auto; z-index: 8000;"></div>
                    </div>
                `;
                setTimeout(() => loadIamRolesForParam(key), 100);
            } else if (key === 'SecretName' || key.toLowerCase().includes('secret')) {
                div.innerHTML = `
                    <label>${key}:</label>
                    <div style="position: relative; display: flex; align-items: center;">
                        <input type="text" id="param-${key}" placeholder="${description}" value="${defaultValue}" required oninput="filterSecrets('${key}')" style="flex: 1;">
                        <button type="button" onclick="showAllSecrets('${key}')" style="background: #007cba; color: white; border: none; padding: 8px 12px; margin-left: 5px; border-radius: 4px; cursor: pointer; font-size: 12px;">▼</button>
                        <div id="secrets-dropdown-${key}" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #ddd; border-top: none; max-height: 200px; overflow-y: auto; z-index: 8000;"></div>
                    </div>
                `;
                setTimeout(() => loadSecretsManagerSecrets(key), 100);
            } else if (key === 'S3BucketName' || (param && param.Metadata && param.Metadata.SearchType === 's3-bucket')) {
                div.innerHTML = `
                    <label>${key}:</label>
                    <div style="position: relative; display: flex; align-items: center;">
                        <input type="text" id="param-${key}" placeholder="${description}" value="${defaultValue}" required oninput="filterS3Buckets('${key}')" style="flex: 1;">
                        <button type="button" onclick="showAllS3Buckets('${key}')" style="background: #007cba; color: white; border: none; padding: 8px 12px; margin-left: 5px; border-radius: 4px; cursor: pointer; font-size: 12px;">▼</button>
                        <div id="s3-dropdown-${key}" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #ddd; border-top: none; max-height: 200px; overflow-y: auto; z-index: 8000;"></div>
                    </div>
                `;
                setTimeout(() => loadS3Buckets(key), 100);
            } else if (key === 'VenafiRoleArn') {
                div.innerHTML = `
                    <label>${key}:</label>
                    <div style="position: relative;">
                        <input type="text" id="param-${key}" placeholder="${description}" value="${defaultValue}" required oninput="filterRoles('${key}')">
                        <div id="role-dropdown-${key}" style="display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #ddd; border-top: none; max-height: 200px; overflow-y: auto; z-index: 8000;"></div>
                    </div>
                `;
                setTimeout(() => loadIamRoles(key), 100);
            } else if (key === 'LayerName') {
                div.innerHTML = `
                    <label>${key}:</label>
                    <input type="text" id="param-${key}" placeholder="${description}" value="${defaultValue}" required readonly>
                    <select id="layer-selector-${key}" onchange="selectLayer('${key}')">
                        <option value="">Loading layers...</option>
                    </select>
                `;
                // Load Lambda layers after creating the element
                setTimeout(() => loadLambdaLayers(key, defaultValue), 100);
            } else if (param && param.AllowedValues && Array.isArray(param.AllowedValues)) {
                const options = param.AllowedValues.map(value => 
                    `<option value="${value}" ${value === defaultValue ? 'selected' : ''}>${value}</option>`
                ).join('');
                div.innerHTML = `
                    <label>${key}:</label>
                    <select id="param-${key}" required>
                        ${!defaultValue ? '<option value="">Select...</option>' : ''}
                        ${options}
                    </select>
                `;
            } else {
                div.innerHTML = `
                    <label>${key}:</label>
                    <input type="text" id="param-${key}" placeholder="${description}" value="${defaultValue}" required>
                `;
            }
            groupDiv.appendChild(div);
        });
        
        container.appendChild(groupDiv);
    });
    
    currentGroup = 0;
    updatePagination();
}

// Parameter pagination functions
function updatePagination() {
    const prevButton = document.getElementById('prevButton');
    const nextButton = document.getElementById('nextButton');
    const pageInfo = document.getElementById('pageInfo');
    const deployButton = document.getElementById('deployButton');
    const stackNameGroup = document.getElementById('stackNameGroup');
    
    prevButton.style.display = currentGroup > 0 ? 'inline-block' : 'none';
    
    if (currentGroup < parameterGroups.length - 1) {
        nextButton.style.display = 'inline-block';
        deployButton.style.display = 'none';
        stackNameGroup.style.display = 'none';
    } else {
        nextButton.style.display = 'none';
        deployButton.style.display = 'inline-block';
        stackNameGroup.style.display = 'block';
    }
    
    pageInfo.textContent = `Step ${currentGroup + 1} of ${parameterGroups.length}`;
}

function nextGroup() {
    if (!validateCurrentGroup()) {
        showAlert('Please fill in all required fields before proceeding.', 'warning');
        return;
    }
    
    // Check for SNS topic validation
    const snsInputs = document.querySelectorAll('[id^="param-SNSTopic"]');
    for (let input of snsInputs) {
        if (input.dataset.snsValid === 'false') {
            showAlert('Please enter a unique SNS topic name before proceeding.', 'warning');
            return;
        }
    }
    
    // Check for bucket name validation
    const bucketInputs = document.querySelectorAll('[id^="param-BucketName"]');
    for (let input of bucketInputs) {
        if (input.dataset.bucketValid === 'false') {
            showAlert('Please enter an available S3 bucket name before proceeding.', 'warning');
            return;
        }
    }
    
    if (currentGroup < parameterGroups.length - 1) {
        // Check if we're using advanced parameter display (with groups)
        const hasGroups = document.querySelector('.parameter-group');
        if (hasGroups) {
            document.getElementById(`group-${currentGroup}`).classList.remove('active');
            currentGroup++;
            document.getElementById(`group-${currentGroup}`).classList.add('active');
            updatePagination();
        } else {
            currentGroup++;
            displayCurrentGroup();
        }
    }
}

function previousGroup() {
    if (currentGroup > 0) {
        // Check if we're using advanced parameter display (with groups)
        const hasGroups = document.querySelector('.parameter-group');
        if (hasGroups) {
            document.getElementById(`group-${currentGroup}`).classList.remove('active');
            currentGroup--;
            document.getElementById(`group-${currentGroup}`).classList.add('active');
            updatePagination();
        } else {
            currentGroup--;
            displayCurrentGroup();
        }
    }
}

function validateCurrentGroup() {
    // Check if we're using advanced parameter display (with groups)
    const hasGroups = document.querySelector('.parameter-group');
    if (hasGroups) {
        const currentGroupDiv = document.getElementById(`group-${currentGroup}`);
        if (currentGroupDiv) {
            const inputs = currentGroupDiv.querySelectorAll('input[required], select[required]');
            for (let input of inputs) {
                if (!input.value.trim()) {
                    return false;
                }
            }
            return true;
        }
    }
    
    // Basic validation for simple parameter display
    const container = document.getElementById('parameterInputs');
    const inputs = container.querySelectorAll('input[required], select[required]');
    
    for (let input of inputs) {
        if (!input.value.trim()) {
            return false;
        }
    }
    return true;
}





// VPC and Subnet handling
function onVpcChange(vpcParamKey) {
    const vpcId = document.getElementById(`param-${vpcParamKey}`).value;
    
    // Find subnet checkboxes and load subnets for them
    const subnetContainers = document.querySelectorAll('[id^="subnet-checkboxes-"]');
    subnetContainers.forEach(container => {
        const paramKey = container.id.replace('subnet-checkboxes-', '');
        if (vpcId) {
            // Check if there are existing subnet values to preserve
            const existingValue = document.getElementById(`param-${paramKey}`).value;
            const existingSubnets = existingValue ? existingValue.split(',').map(s => s.trim()) : [];
            loadSubnets(paramKey, vpcId, existingSubnets);
        } else {
            container.innerHTML = '<div style="color: #666; font-style: italic;">Select VPC first</div>';
            document.getElementById(`param-${paramKey}`).value = '';
        }
    });
}

// Load subnets for a specific VPC
async function loadSubnets(paramKey, vpcId, selectedValues = []) {
    const region = document.getElementById('region').value;
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    
    if (!accessKeyId || !secretAccessKey) {
        const container = document.getElementById(`subnet-checkboxes-${paramKey}`);
        container.innerHTML = '<div style="color: #666; font-style: italic;">Configure AWS credentials first</div>';
        return;
    }
    
    try {
        const decodedAccessKey = atob(accessKeyId);
        const decodedSecretKey = atob(secretAccessKey);
        
        const response = await fetch('/subnets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vpcId,
                region,
                accessKeyId: decodedAccessKey,
                secretAccessKey: decodedSecretKey
            })
        });
        
        const data = await response.json();
        const container = document.getElementById(`subnet-checkboxes-${paramKey}`);
        
        if (response.ok) {
            if (data.subnets.length === 0) {
                container.innerHTML = '<div style="color: #666; font-style: italic;">No subnets found in this VPC</div>';
                return;
            }
            
            let checkboxes = '';
            data.subnets.forEach(subnet => {
                const checked = selectedValues.includes(subnet.id) ? 'checked' : '';
                const displayName = subnet.name ? `${subnet.name} (${subnet.id})` : subnet.id;
                checkboxes += `
                    <div style="margin: 5px 0;">
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" value="${subnet.id}" ${checked} onchange="updateSubnetSelection('${paramKey}')" style="margin-right: 8px;">
                            <span>${displayName} - ${subnet.cidr} (${subnet.az})</span>
                        </label>
                    </div>
                `;
            });
            container.innerHTML = checkboxes;
            
            // Update the text input if there are selected values
            if (selectedValues.length > 0) {
                document.getElementById(`param-${paramKey}`).value = selectedValues.join(',');
            }
        } else {
            container.innerHTML = '<div style="color: #dc3545;">Error loading subnets</div>';
            showAlert('Error loading subnets: ' + data.error, 'error');
        }
    } catch (error) {
        const container = document.getElementById(`subnet-checkboxes-${paramKey}`);
        container.innerHTML = '<div style="color: #dc3545;">Error loading subnets</div>';
        showAlert('Error loading subnets: ' + error.message, 'error');
    }
}

// Update subnet selection when checkboxes change
function updateSubnetSelection(paramKey) {
    const container = document.getElementById(`subnet-checkboxes-${paramKey}`);
    const inputElement = document.getElementById(`param-${paramKey}`);
    
    if (container && inputElement) {
        const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
        const selectedValues = Array.from(checkboxes).map(cb => cb.value);
        inputElement.value = selectedValues.join(',');
    }
}

// Validation functions
let snsValidationTimeout;
async function validateSnsTopicName(paramKey) {
    const input = document.getElementById(`param-${paramKey}`);
    const validation = document.getElementById(`sns-validation-${paramKey}`);
    const topicName = input.value.trim();
    
    if (!topicName) {
        validation.textContent = '';
        return;
    }
    
    // Clear previous timeout
    if (snsValidationTimeout) {
        clearTimeout(snsValidationTimeout);
    }
    
    // Debounce validation
    snsValidationTimeout = setTimeout(async () => {
        const region = document.getElementById('region').value;
        const accessKeyId = document.getElementById('accessKeyId').value;
        const secretAccessKey = document.getElementById('secretAccessKey').value;
        
        if (!accessKeyId || !secretAccessKey) {
            validation.textContent = 'Configure AWS credentials to validate topic name';
            validation.style.color = '#666';
            return;
        }
        
        try {
            validation.textContent = 'Checking topic name...';
            validation.style.color = '#666';
            
            const response = await fetch('/check-sns-topic', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topicName,
                    region,
                    accessKeyId: atob(accessKeyId),
                    secretAccessKey: atob(secretAccessKey)
                })
            });
            
            const data = await response.json();
            if (response.ok) {
                if (data.exists) {
                    validation.textContent = '⚠️ Topic name already exists in this region. Please choose a different name.';
                    validation.style.color = '#dc3545';
                    input.style.borderColor = '#dc3545';
                    input.dataset.snsValid = 'false';
                } else {
                    validation.textContent = '✓ Topic name is available';
                    validation.style.color = '#28a745';
                    input.style.borderColor = '#28a745';
                    input.dataset.snsValid = 'true';
                }
            } else {
                validation.textContent = 'Error checking topic name: ' + data.error;
                validation.style.color = '#dc3545';
            }
        } catch (error) {
            validation.textContent = 'Error checking topic name: ' + error.message;
            validation.style.color = '#dc3545';
        }
    }, 1000);
}

// Validate S3 bucket name availability
let bucketValidationTimeout;
async function validateBucketName(paramKey) {
    const input = document.getElementById(`param-${paramKey}`);
    const validation = document.getElementById(`bucket-validation-${paramKey}`);
    const bucketName = input.value.trim();
    
    if (!bucketName) {
        validation.textContent = '';
        input.dataset.bucketValid = '';
        return;
    }
    
    // Clear previous timeout
    if (bucketValidationTimeout) {
        clearTimeout(bucketValidationTimeout);
    }
    
    // Debounce validation
    bucketValidationTimeout = setTimeout(async () => {
        const region = document.getElementById('region').value;
        const accessKeyId = document.getElementById('accessKeyId').value;
        const secretAccessKey = document.getElementById('secretAccessKey').value;
        
        if (!accessKeyId || !secretAccessKey) {
            validation.textContent = 'Configure AWS credentials to validate bucket name';
            validation.style.color = '#666';
            input.dataset.bucketValid = '';
            return;
        }
        
        try {
            validation.textContent = 'Checking bucket name availability...';
            validation.style.color = '#666';
            
            const response = await fetch('/check-bucket-name', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bucketName,
                    region,
                    accessKeyId: atob(accessKeyId),
                    secretAccessKey: atob(secretAccessKey)
                })
            });
            
            const data = await response.json();
            if (response.ok) {
                if (data.available) {
                    validation.textContent = '✓ Bucket name is available';
                    validation.style.color = '#28a745';
                    input.style.borderColor = '#28a745';
                    input.dataset.bucketValid = 'true';
                } else {
                    validation.textContent = '⚠️ Bucket name is not available globally. Please choose a different name.';
                    validation.style.color = '#dc3545';
                    input.style.borderColor = '#dc3545';
                    input.dataset.bucketValid = 'false';
                }
            } else {
                validation.textContent = 'Error checking bucket name: ' + data.error;
                validation.style.color = '#dc3545';
                input.dataset.bucketValid = 'false';
            }
        } catch (error) {
            validation.textContent = 'Error checking bucket name: ' + error.message;
            validation.style.color = '#dc3545';
            input.dataset.bucketValid = 'false';
        }
    }, 1000);
}

// AWS resource loading functions
async function loadVpcs(paramKey, selectedValue = '') {
    const region = document.getElementById('region').value;
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    
    if (!accessKeyId || !secretAccessKey) {
        const selectElement = document.getElementById(`param-${paramKey}`);
        selectElement.innerHTML = '<option value="">Configure AWS credentials first</option>';
        return;
    }
    
    try {
        const decodedAccessKey = atob(accessKeyId);
        const decodedSecretKey = atob(secretAccessKey);
        
        const response = await fetch('/vpcs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                region,
                accessKeyId: decodedAccessKey,
                secretAccessKey: decodedSecretKey
            })
        });
        
        const data = await response.json();
        const selectElement = document.getElementById(`param-${paramKey}`);
        
        if (response.ok) {
            let options = '<option value="">Select a VPC...</option>';
            data.vpcs.forEach(vpc => {
                const selected = vpc.id === selectedValue ? 'selected' : '';
                const displayName = vpc.name ? `${vpc.name} (${vpc.id})` : vpc.id;
                options += `<option value="${vpc.id}" ${selected}>${displayName} - ${vpc.cidr}</option>`;
            });
            selectElement.innerHTML = options;
            
            // If there's a selected VPC, trigger subnet loading
            if (selectedValue) {
                setTimeout(() => onVpcChange(paramKey), 100);
            }
        } else {
            selectElement.innerHTML = '<option value="">Error loading VPCs</option>';
            showAlert('Error loading VPCs: ' + data.error, 'error');
        }
    } catch (error) {
        const selectElement = document.getElementById(`param-${paramKey}`);
        selectElement.innerHTML = '<option value="">Error loading VPCs</option>';
        showAlert('Error loading VPCs: ' + error.message, 'error');
    }
}

async function loadLambdaLayers(paramKey, selectedValue = '') {
    const region = document.getElementById('region').value;
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    
    if (!accessKeyId || !secretAccessKey) {
        const selectElement = document.getElementById(`param-${paramKey}`);
        selectElement.innerHTML = '<option value="">Configure AWS credentials first</option>';
        return;
    }
    
    try {
        const decodedAccessKey = atob(accessKeyId);
        const decodedSecretKey = atob(secretAccessKey);
        
        const response = await fetch('/lambda-layers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                region,
                accessKeyId: decodedAccessKey,
                secretAccessKey: decodedSecretKey
            })
        });
        
        const data = await response.json();
        const selectElement = document.getElementById(`layer-selector-${paramKey}`);
        
        if (response.ok) {
            let options = '<option value="">Select a Lambda layer...</option>';
            data.layers.forEach(layer => {
                const selected = layer.arn === selectedValue ? 'selected' : '';
                options += `<option value="${layer.arn}" ${selected}>${layer.name}</option>`;
            });
            selectElement.innerHTML = options;
            
            // If there's a selected value, populate the text input
            if (selectedValue) {
                document.getElementById(`param-${paramKey}`).value = selectedValue;
            }
        } else {
            selectElement.innerHTML = '<option value="">Error loading layers</option>';
            showAlert('Error loading Lambda layers: ' + data.error, 'error');
        }
    } catch (error) {
        const selectElement = document.getElementById(`layer-selector-${paramKey}`);
        selectElement.innerHTML = '<option value="">Error loading layers</option>';
        showAlert('Error loading Lambda layers: ' + error.message, 'error');
    }
}

async function loadIamRoles(paramKey) {
    const region = document.getElementById('region').value;
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    
    if (!accessKeyId || !secretAccessKey) return;
    
    try {
        const response = await fetch('/iam-roles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                region,
                accessKeyId: atob(accessKeyId),
                secretAccessKey: atob(secretAccessKey)
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            window[`roles_${paramKey}`] = data.roles;
        }
    } catch (error) {
        console.error('Error loading IAM roles:', error);
    }
}

function filterRoles(paramKey) {
    const input = document.getElementById(`param-${paramKey}`);
    const dropdown = document.getElementById(`role-dropdown-${paramKey}`);
    const roles = window[`roles_${paramKey}`] || [];
    const query = input.value.toLowerCase();
    
    if (query.length < 2) {
        dropdown.style.display = 'none';
        return;
    }
    
    const filtered = roles.filter(role => 
        role.name.toLowerCase().includes(query)
    ).slice(0, 10);
    
    if (filtered.length === 0) {
        dropdown.style.display = 'none';
        return;
    }
    
    dropdown.innerHTML = filtered.map(role => 
        `<div onclick="selectRole('${paramKey}', '${role.arn}')" style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">${role.name}</div>`
    ).join('');
    
    dropdown.style.display = 'block';
}

function selectRole(paramKey, arn) {
    document.getElementById(`param-${paramKey}`).value = arn;
    document.getElementById(`role-dropdown-${paramKey}`).style.display = 'none';
}

function selectLayer(paramKey) {
    const selectElement = document.getElementById(`layer-selector-${paramKey}`);
    const inputElement = document.getElementById(`param-${paramKey}`);
    
    if (selectElement && inputElement) {
        inputElement.value = selectElement.value;
    }
}

// RDS Instance functions
async function loadRdsInstances(paramKey) {
    const region = document.getElementById('region').value;
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    
    if (!accessKeyId || !secretAccessKey) return;
    
    try {
        const response = await fetch('/rds-instances', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                region,
                accessKeyId: atob(accessKeyId),
                secretAccessKey: atob(secretAccessKey)
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            window[`rdsInstances_${paramKey}`] = data.instances;
        }
    } catch (error) {
        console.error('Error loading RDS instances:', error);
    }
}

function filterRdsInstances(paramKey) {
    const input = document.getElementById(`param-${paramKey}`);
    const dropdown = document.getElementById(`rds-dropdown-${paramKey}`);
    const instances = window[`rdsInstances_${paramKey}`] || [];
    const query = input.value.toLowerCase();
    
    if (query.length < 1) {
        dropdown.style.display = 'none';
        return;
    }
    
    const filtered = instances.filter(instance => 
        instance.identifier.toLowerCase().includes(query)
    ).slice(0, 10);
    
    if (filtered.length === 0) {
        dropdown.style.display = 'none';
        return;
    }
    
    dropdown.innerHTML = filtered.map(instance => 
        `<div onclick="selectRdsInstance('${paramKey}', '${instance.identifier}')" style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">
            <strong>${instance.identifier}</strong><br>
            <small style="color: #666;">${instance.engine} - ${instance.status}</small>
        </div>`
    ).join('');
    
    dropdown.style.display = 'block';
}

function selectRdsInstance(paramKey, identifier) {
    document.getElementById(`param-${paramKey}`).value = identifier;
    document.getElementById(`rds-dropdown-${paramKey}`).style.display = 'none';
}

function showAllRdsInstances(paramKey) {
    const dropdown = document.getElementById(`rds-dropdown-${paramKey}`);
    const instances = window[`rdsInstances_${paramKey}`] || [];
    
    if (instances.length === 0) {
        dropdown.innerHTML = '<div style="padding: 8px; color: #666;">No RDS instances found</div>';
    } else {
        dropdown.innerHTML = instances.map(instance => 
            `<div onclick="selectRdsInstance('${paramKey}', '${instance.identifier}')" style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">
                <strong>${instance.identifier}</strong><br>
                <small style="color: #666;">${instance.engine} - ${instance.status}</small>
            </div>`
        ).join('');
    }
    
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}

// IAM Roles for general Role parameters
async function loadIamRolesForParam(paramKey) {
    const region = document.getElementById('region').value;
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    
    if (!accessKeyId || !secretAccessKey) return;
    
    try {
        const response = await fetch('/iam-roles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                region,
                accessKeyId: atob(accessKeyId),
                secretAccessKey: atob(secretAccessKey)
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            window[`iamRoles_${paramKey}`] = data.roles;
        }
    } catch (error) {
        console.error('Error loading IAM roles:', error);
    }
}

function filterIamRoles(paramKey) {
    const input = document.getElementById(`param-${paramKey}`);
    const dropdown = document.getElementById(`role-dropdown-${paramKey}`);
    const roles = window[`iamRoles_${paramKey}`] || [];
    const query = input.value.toLowerCase();
    
    if (query.length < 1) {
        dropdown.style.display = 'none';
        return;
    }
    
    const filtered = roles.filter(role => 
        role.name.toLowerCase().includes(query) || role.arn.toLowerCase().includes(query)
    ).slice(0, 10);
    
    if (filtered.length === 0) {
        dropdown.style.display = 'none';
        return;
    }
    
    dropdown.innerHTML = filtered.map(role => 
        `<div onclick="selectIamRole('${paramKey}', '${role.arn}')" style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">
            <strong>${role.name}</strong><br>
            <small style="color: #666;">${role.arn}</small>
        </div>`
    ).join('');
    
    dropdown.style.display = 'block';
}

function selectIamRole(paramKey, arn) {
    document.getElementById(`param-${paramKey}`).value = arn;
    document.getElementById(`role-dropdown-${paramKey}`).style.display = 'none';
}

function showAllIamRoles(paramKey) {
    const dropdown = document.getElementById(`role-dropdown-${paramKey}`);
    const roles = window[`iamRoles_${paramKey}`] || [];
    
    if (roles.length === 0) {
        dropdown.innerHTML = '<div style="padding: 8px; color: #666;">No IAM roles found</div>';
    } else {
        dropdown.innerHTML = roles.map(role => 
            `<div onclick="selectIamRole('${paramKey}', '${role.arn}')" style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">
                <strong>${role.name}</strong><br>
                <small style="color: #666;">${role.arn}</small>
            </div>`
        ).join('');
    }
    
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}

// Secrets Manager functions
async function loadSecretsManagerSecrets(paramKey) {
    const region = document.getElementById('region').value;
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    
    if (!accessKeyId || !secretAccessKey) return;
    
    try {
        const response = await fetch('/secrets-manager-secrets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                region,
                accessKeyId: atob(accessKeyId),
                secretAccessKey: atob(secretAccessKey)
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            window[`secrets_${paramKey}`] = data.secrets;
        }
    } catch (error) {
        console.error('Error loading Secrets Manager secrets:', error);
    }
}

function filterSecrets(paramKey) {
    const input = document.getElementById(`param-${paramKey}`);
    const dropdown = document.getElementById(`secrets-dropdown-${paramKey}`);
    const secrets = window[`secrets_${paramKey}`] || [];
    const query = input.value.toLowerCase();
    
    if (query.length < 1) {
        dropdown.style.display = 'none';
        return;
    }
    
    const filtered = secrets.filter(secret => 
        secret.name.toLowerCase().includes(query)
    ).slice(0, 10);
    
    if (filtered.length === 0) {
        dropdown.style.display = 'none';
        return;
    }
    
    dropdown.innerHTML = filtered.map(secret => 
        `<div onclick="selectSecret('${paramKey}', '${secret.name}')" style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">
            <strong>${secret.name}</strong><br>
            <small style="color: #666;">${secret.description || 'No description'}</small>
        </div>`
    ).join('');
    
    dropdown.style.display = 'block';
}

function selectSecret(paramKey, secretName) {
    document.getElementById(`param-${paramKey}`).value = secretName;
    document.getElementById(`secrets-dropdown-${paramKey}`).style.display = 'none';
}

function showAllSecrets(paramKey) {
    const dropdown = document.getElementById(`secrets-dropdown-${paramKey}`);
    const secrets = window[`secrets_${paramKey}`] || [];
    
    if (secrets.length === 0) {
        dropdown.innerHTML = '<div style="padding: 8px; color: #666;">No secrets found</div>';
    } else {
        dropdown.innerHTML = secrets.map(secret => 
            `<div onclick="selectSecret('${paramKey}', '${secret.name}')" style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">
                <strong>${secret.name}</strong><br>
                <small style="color: #666;">${secret.description || 'No description'}</small>
            </div>`
        ).join('');
    }
    
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}


// S3 Bucket functions
async function loadS3Buckets(paramKey) {
    const region = document.getElementById('region').value;
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    
    if (!accessKeyId || !secretAccessKey) return;
    
    try {
        const response = await fetch('/list-s3-buckets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                region,
                accessKeyId: atob(accessKeyId),
                secretAccessKey: atob(secretAccessKey),
                query: ''
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            window[`s3Buckets_${paramKey}`] = data.buckets;
        }
    } catch (error) {
        console.error('Error loading S3 buckets:', error);
    }
}

function filterS3Buckets(paramKey) {
    const input = document.getElementById(`param-${paramKey}`);
    const dropdown = document.getElementById(`s3-dropdown-${paramKey}`);
    const buckets = window[`s3Buckets_${paramKey}`] || [];
    const query = input.value.toLowerCase();
    
    if (query.length < 1) {
        dropdown.style.display = 'none';
        return;
    }
    
    const filtered = buckets.filter(bucket => 
        bucket.name.toLowerCase().includes(query)
    ).slice(0, 10);
    
    if (filtered.length === 0) {
        dropdown.style.display = 'none';
        return;
    }
    
    dropdown.innerHTML = filtered.map(bucket => 
        `<div onclick="selectS3Bucket('${paramKey}', '${bucket.name}')" style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">
            <strong>${bucket.name}</strong><br>
            <small style="color: #666;">Created: ${new Date(bucket.creationDate).toLocaleDateString()}</small>
        </div>`
    ).join('');
    
    dropdown.style.display = 'block';
}

function selectS3Bucket(paramKey, bucketName) {
    document.getElementById(`param-${paramKey}`).value = bucketName;
    document.getElementById(`s3-dropdown-${paramKey}`).style.display = 'none';
}

function showAllS3Buckets(paramKey) {
    const dropdown = document.getElementById(`s3-dropdown-${paramKey}`);
    const buckets = window[`s3Buckets_${paramKey}`] || [];
    
    if (buckets.length === 0) {
        dropdown.innerHTML = '<div style="padding: 8px; color: #666;">No S3 buckets found</div>';
    } else {
        dropdown.innerHTML = buckets.map(bucket => 
            `<div onclick="selectS3Bucket('${paramKey}', '${bucket.name}')" style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='white'">
                <strong>${bucket.name}</strong><br>
                <small style="color: #666;">Created: ${new Date(bucket.creationDate).toLocaleDateString()}</small>
            </div>`
        ).join('');
    }
    
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}
