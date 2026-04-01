#!/bin/bash

# Quick ALB setup for CloudInfra
AWS_REGION="af-south-1"
VPC_ID="vpc-00d415890785f472e"  # Replace with your VPC ID
SUBNET_IDS="subnet-0cddd6d8502de48b4,subnet-0deffd3d767f0c164"  # Replace with your subnet IDs

# Create security group for ALB
ALB_SG=$(aws ec2 create-security-group \
    --group-name cloudinfra-alb-sg \
    --description "CloudInfra ALB Security Group" \
    --vpc-id $VPC_ID \
    --query 'GroupId' --output text)

# Allow HTTP/HTTPS traffic from VPN networks only
aws ec2 authorize-security-group-ingress \
    --group-id $ALB_SG \
    --protocol tcp \
    --port 80 \
    --cidr 172.17.0.0/16

aws ec2 authorize-security-group-ingress \
    --group-id $ALB_SG \
    --protocol tcp \
    --port 80 \
    --cidr 172.16.0.0/16

aws ec2 authorize-security-group-ingress \
    --group-id $ALB_SG \
    --protocol tcp \
    --port 80 \
    --cidr 10.0.0.0/8

aws ec2 authorize-security-group-ingress \
    --group-id $ALB_SG \
    --protocol tcp \
    --port 443 \
    --cidr 172.17.0.0/16

aws ec2 authorize-security-group-ingress \
    --group-id $ALB_SG \
    --protocol tcp \
    --port 443 \
    --cidr 172.16.0.0/16

aws ec2 authorize-security-group-ingress \
    --group-id $ALB_SG \
    --protocol tcp \
    --port 443 \
    --cidr 10.0.0.0/8

# Create internal ALB
ALB_ARN=$(aws elbv2 create-load-balancer \
    --name cloudinfra-alb \
    --subnets $SUBNET_IDS \
    --security-groups $ALB_SG \
    --scheme internal \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)

# Create target group
TG_ARN=$(aws elbv2 create-target-group \
    --name cloudinfra-tg \
    --protocol HTTP \
    --port 3000 \
    --vpc-id $VPC_ID \
    --target-type ip \
    --health-check-path /health \
    --query 'TargetGroups[0].TargetGroupArn' --output text)

# Create listener
aws elbv2 create-listener \
    --load-balancer-arn $ALB_ARN \
    --protocol HTTP \
    --port 80 \
    --default-actions Type=forward,TargetGroupArn=$TG_ARN

# Get ALB DNS name
ALB_DNS=$(aws elbv2 describe-load-balancers \
    --load-balancer-arns $ALB_ARN \
    --query 'LoadBalancers[0].DNSName' --output text)

echo "✅ Private ALB created successfully!"
echo "🌐 Internal ALB DNS: $ALB_DNS"
echo "📋 Target Group ARN: $TG_ARN"
echo ""
echo "⚠️  Note: This is an INTERNAL ALB - only accessible from within the VPC"
echo ""
echo "Next steps:"
echo "1. Update ecs-service.json with Target Group ARN"
echo "2. Create private DNS record: cloudinfra.standardbank.co.za → $ALB_DNS"
echo "3. Ensure access via VPN/Direct Connect or bastion host"