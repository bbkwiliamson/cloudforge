#!/bin/bash

# CloudInfra Deployment Script
echo "🚀 Deploying CloudInfra..."

# Update system packages
sudo apt update

# Install required packages
sudo apt install -y nginx python3 python3-pip

# Install Python dependencies
pip3 install flask boto3 pyyaml werkzeug

# Copy Nginx configuration
sudo cp nginx-cloudinfra.conf /etc/nginx/sites-available/cloudinfra
sudo ln -sf /etc/nginx/sites-available/cloudinfra /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# Copy systemd service
sudo cp cloudinfra.service /etc/systemd/system/
sudo sed -i "s|/path/to/BBK-CDK/cloudformation-deployer|$(pwd)|g" /etc/systemd/system/cloudinfra.service

# Reload systemd and start services
sudo systemctl daemon-reload
sudo systemctl enable cloudinfra
sudo systemctl start cloudinfra

# Restart Nginx
sudo systemctl restart nginx

# Check service status
echo "📊 Service Status:"
sudo systemctl status cloudinfra --no-pager
sudo systemctl status nginx --no-pager

echo "✅ CloudInfra deployed successfully!"
echo "🌐 Access your application at: http://cloudinfra.standardbank.co.za"
echo ""
echo "📝 Useful commands:"
echo "  - Check logs: sudo journalctl -u cloudinfra -f"
echo "  - Restart app: sudo systemctl restart cloudinfra"
echo "  - Restart nginx: sudo systemctl restart nginx"