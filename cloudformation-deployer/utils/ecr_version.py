import boto3
import logging

logger = logging.getLogger(__name__)

ECR_ACCOUNT_ID = '573185292006'
ECR_REGION = 'af-south-1'
ECR_REPOSITORY = 'cloudforge/cloudforge'


def get_latest_image_tag():
    """Get the most recently pushed image tag from the CloudForge ECR repository"""
    try:
        ecr_client = boto3.client('ecr', region_name=ECR_REGION)
        response = ecr_client.describe_images(
            registryId=ECR_ACCOUNT_ID,
            repositoryName=ECR_REPOSITORY,
            filter={'tagStatus': 'TAGGED'}
        )
        images = response.get('imageDetails', [])
        if not images:
            return 'unknown'

        latest = max(images, key=lambda img: img.get('imagePushedAt'))
        tags = latest.get('imageTags', [])
        return tags[0] if tags else 'unknown'
    except Exception as e:
        logger.warning(f"Could not fetch ECR image tag: {e}")
        return 'unknown'
