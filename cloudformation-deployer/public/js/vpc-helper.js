// VPC Helper Module
async function openVpcHelper() {
    document.getElementById('vpcHelperPopup').style.display = 'block';
    makeDraggable('vpcHelperPopup', 'vpcHelperHeader');
    await loadVpcHelperVpcs();
}

function closeVpcHelper() {
    document.getElementById('vpcHelperPopup').style.display = 'none';
}

function minimizeVpcHelper() {
    const popup = document.getElementById('vpcHelperPopup');
    const content = document.getElementById('vpcHelperContent');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        popup.style.height = 'auto';
    } else {
        content.style.display = 'none';
        popup.style.height = '50px';
    }
}

// Make window draggable
function makeDraggable(windowId, headerId) {
    const popup = document.getElementById(windowId);
    const header = document.getElementById(headerId);
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    header.onmousedown = dragMouseDown;
    
    function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }
    
    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        popup.style.top = (popup.offsetTop - pos2) + "px";
        popup.style.left = (popup.offsetLeft - pos1) + "px";
    }
    
    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

async function loadVpcHelperVpcs() {
    const region = document.getElementById('region').value;
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    
    try {
        const response = await fetch('/vpcs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ region, accessKeyId: atob(accessKeyId), secretAccessKey: atob(secretAccessKey) })
        });
        
        const data = await response.json();
        const select = document.getElementById('vpcHelperVpcSelect');
        
        if (response.ok) {
            let options = '<option value="">Select a VPC...</option>';
            data.vpcs.forEach(vpc => {
                const displayName = vpc.name ? `${vpc.name} (${vpc.id})` : vpc.id;
                options += `<option value="${vpc.id}">${displayName} - ${vpc.cidr}</option>`;
            });
            select.innerHTML = options;
        } else {
            select.innerHTML = '<option value="">Error loading VPCs</option>';
        }
    } catch (error) {
        document.getElementById('vpcHelperVpcSelect').innerHTML = '<option value="">Error loading VPCs</option>';
    }
}

async function loadVpcHelperSubnets() {
    const vpcId = document.getElementById('vpcHelperVpcSelect').value;
    const subnetsDiv = document.getElementById('vpcHelperSubnetsDiv');
    const showButton = document.getElementById('vpcHelperShowDetails');
    
    if (!vpcId) {
        subnetsDiv.style.display = 'none';
        showButton.style.display = 'none';
        return;
    }
    
    const region = document.getElementById('region').value;
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    
    try {
        const response = await fetch('/subnets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vpcId, region, accessKeyId: atob(accessKeyId), secretAccessKey: atob(secretAccessKey) })
        });
        
        const data = await response.json();
        const container = document.getElementById('vpcHelperSubnets');
        
        if (response.ok) {
            let checkboxes = '';
            data.subnets.forEach(subnet => {
                const displayName = subnet.name ? `${subnet.name} (${subnet.id})` : subnet.id;
                checkboxes += `
                    <div style="margin: 5px 0;">
                        <label style="display: flex; align-items: center; cursor: pointer;">
                            <input type="checkbox" value="${subnet.id}" style="margin-right: 8px;">
                            <span>${displayName} - ${subnet.cidr} (${subnet.az})</span>
                        </label>
                    </div>
                `;
            });
            container.innerHTML = checkboxes;
            subnetsDiv.style.display = 'block';
            showButton.style.display = 'block';
        } else {
            container.innerHTML = '<div style="color: #dc3545;">Error loading subnets</div>';
        }
    } catch (error) {
        document.getElementById('vpcHelperSubnets').innerHTML = '<div style="color: #dc3545;">Error loading subnets</div>';
    }
}

async function showVpcDetails() {
    const vpcId = document.getElementById('vpcHelperVpcSelect').value;
    const selectedSubnets = Array.from(document.querySelectorAll('#vpcHelperSubnets input:checked')).map(cb => cb.value);
    
    const region = document.getElementById('region').value;
    const accessKeyId = document.getElementById('accessKeyId').value;
    const secretAccessKey = document.getElementById('secretAccessKey').value;
    
    try {
        const [vpcResponse, subnetsResponse] = await Promise.all([
            fetch('/vpc-details', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vpcId, region, accessKeyId: atob(accessKeyId), secretAccessKey: atob(secretAccessKey) })
            }),
            fetch('/subnets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vpcId, region, accessKeyId: atob(accessKeyId), secretAccessKey: atob(secretAccessKey) })
            })
        ]);
        
        const vpcData = await vpcResponse.json();
        const subnetsData = await subnetsResponse.json();
        
        if (vpcResponse.ok && subnetsResponse.ok) {
            const selectedSubnetDetails = subnetsData.subnets.filter(s => selectedSubnets.includes(s.id));
            displayVpcDetails(vpcData, selectedSubnetDetails);
        }
    } catch (error) {
        showAlert('Error loading VPC details: ' + error.message, 'error');
    }
}

function displayVpcDetails(vpcData, selectedSubnets) {
    const container = document.getElementById('vpcHelperDetails');
    
    let html = `
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin-top: 15px;">
            <h5 style="margin-top: 0; color: #007cba;">VPC Details</h5>
            <div style="margin-bottom: 10px;">
                <strong>VPC Name:</strong> <span onclick="copyToClipboard('${vpcData.vpcName}')" style="cursor: pointer; color: #007cba; text-decoration: underline;">${vpcData.vpcName || 'N/A'}</span>
            </div>
            <div style="margin-bottom: 10px;">
                <strong>VPC ID:</strong> <span onclick="copyToClipboard('${vpcData.vpcId}')" style="cursor: pointer; color: #007cba; text-decoration: underline;">${vpcData.vpcId}</span>
            </div>
            <div style="margin-bottom: 10px;">
                <strong>CIDRs:</strong> ${vpcData.cidrs.map(cidr => `<span onclick="copyToClipboard('${cidr}')" style="cursor: pointer; color: #007cba; text-decoration: underline; margin-right: 10px;">${cidr}</span>`).join('')}
            </div>
            <div style="margin-bottom: 15px;">
                <strong>Route Tables:</strong> ${vpcData.routeTables.map(rt => `<span onclick="copyToClipboard('${rt}')" style="cursor: pointer; color: #007cba; text-decoration: underline; margin-right: 10px;">${rt}</span>`).join('')}
            </div>
    `;
    
    if (selectedSubnets.length > 0) {
        html += `
            <h5 style="color: #007cba;">Selected Subnets</h5>
            ${selectedSubnets.map(subnet => `
                <div style="background: white; padding: 10px; margin: 5px 0; border-radius: 3px; border-left: 3px solid #007cba;">
                    <div><strong>Name:</strong> <span onclick="copyToClipboard('${subnet.name || 'N/A'}')" style="cursor: pointer; color: #007cba; text-decoration: underline;">${subnet.name || 'N/A'}</span></div>
                    <div><strong>Subnet ID:</strong> <span onclick="copyToClipboard('${subnet.id}')" style="cursor: pointer; color: #007cba; text-decoration: underline;">${subnet.id}</span></div>
                    <div><strong>CIDR:</strong> <span onclick="copyToClipboard('${subnet.cidr}')" style="cursor: pointer; color: #007cba; text-decoration: underline;">${subnet.cidr}</span></div>
                    <div><strong>AZ:</strong> <span onclick="copyToClipboard('${subnet.az}')" style="cursor: pointer; color: #007cba; text-decoration: underline;">${subnet.az}</span></div>
                    <div><strong>Available IPs:</strong> <span style="color: ${subnet.availableIps < 10 ? '#dc3545' : '#28a745'}; font-weight: bold;">${subnet.availableIps}</span></div>
                </div>
            `).join('')}
        `;
    }
    
    html += '</div>';
    container.innerHTML = html;
    container.style.display = 'block';
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showAlert(`Copied: ${text}`, 'success');
    }).catch(() => {
        showAlert('Failed to copy to clipboard', 'error');
    });
}