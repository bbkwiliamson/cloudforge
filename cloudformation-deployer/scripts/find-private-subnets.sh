#!/bin/bash

# Find private subnets in your VPC
VPC_ID="vpc-00d415890785f472e"
AWS_REGION="af-south-1"

echo "🔍 Finding private subnets in VPC: $VPC_ID"
echo ""

# Get all subnets in the VPC
aws ec2 describe-subnets \
    --region $AWS_REGION \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --query 'Subnets[*].[SubnetId,AvailabilityZone,CidrBlock,MapPublicIpOnLaunch]' \
    --output table

echo ""
echo "📋 Private subnets (MapPublicIpOnLaunch=False):"
aws ec2 describe-subnets \
    --region $AWS_REGION \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=map-public-ip-on-launch,Values=false" \
    --query 'Subnets[*].SubnetId' \
    --output text | tr '\t' ','

echo ""
echo "⚠️  Use the private subnet IDs in your create-alb.sh script"