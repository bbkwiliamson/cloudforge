# CloudFormation Deployer

A web application that allows users to upload CloudFormation templates, fill in parameters, and deploy them to specified AWS accounts and regions.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Configure AWS credentials:
```bash
aws configure
```

3. Start the server:
```bash
python server.py
```

4. Open http://localhost:3000 in your browser

## Usage

1. Upload a CloudFormation YAML/JSON template
2. Fill in the template parameters
3. Specify stack name, region, and account ID
4. Click "Deploy Stack" to deploy to CloudFormation

## Features

- Automatic parameter extraction from CloudFormation templates
- Support for YAML and JSON templates
- Multi-region deployment
- Real-time deployment feedback