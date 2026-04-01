#!/bin/bash

# CloudInfra ECS Deployment Script
echo "⚡ Deploying CloudInfra to ECS..."

# Configuration
AWS_REGION="af-south-1"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="cloudinfra"
IMAGE_TAG="latest"
CLUSTER_NAME="cloudinfra-cluster"

# Build and push Docker image
echo "🐳 Building Docker image..."
docker build -t $ECR_REPO:$IMAGE_TAG .

# Create ECR repository if it doesn't exist
aws ecr describe-repositories --repository-names $ECR_REPO --region $AWS_REGION 2>/dev/null || \
aws ecr create-repository --repository-name $ECR_REPO --region $AWS_REGION

# Get ECR login token
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Tag and push image
docker tag $ECR_REPO:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$IMAGE_TAG

echo "📦 Image pushed to ECR successfully!"

# Update task definition with actual values
sed -i.bak "s/ACCOUNT_ID/$AWS_ACCOUNT_ID/g" ecs-task-definition.json
sed -i.bak "s/REGION/$AWS_REGION/g" ecs-task-definition.json

# Create CloudWatch log group
aws logs create-log-group --log-group-name /ecs/cloudinfra --region $AWS_REGION 2>/dev/null || true

# Register task definition
echo "📋 Registering ECS task definition..."
aws ecs register-task-definition --cli-input-json file://ecs-task-definition.json --region $AWS_REGION

# Create ECS cluster if it doesn't exist
aws ecs describe-clusters --clusters $CLUSTER_NAME --region $AWS_REGION 2>/dev/null || \
aws ecs create-cluster --cluster-name $CLUSTER_NAME --region $AWS_REGION

echo "✅ ECS deployment completed!"
echo "🌐 Next steps:"
echo "  1. Create Application Load Balancer"
echo "  2. Update ecs-service.json with your subnet/security group IDs"
echo "  3. Create ECS service: aws ecs create-service --cli-input-json file://ecs-service.json"
echo "  4. Point cloudinfra.standardbank.co.za to ALB DNS name"