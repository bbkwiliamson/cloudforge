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
    if the first three steps fail... do the following
                            # 1. Navigate to the app directory
                        cd /Users/brain.bapela/BBK-CDK/systems_enablement_tools_cloudforge/cloudformation-deployer

                        # 2. Create virtual environment
                        python3 -m venv venv

                        # 3. Activate it
                        source venv/bin/activate

                        # 4. Install dependencies
                        pip install -r requirements.txt

                        # 5. Set up your env file
                        cp .env.example .env
                        # Edit .env with your actual credentials

                        # 6. Run the app
                        python server.py


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