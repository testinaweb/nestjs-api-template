#!/bin/bash

POOL_ID=$(aws cloudformation describe-stacks --stack-name CognitoPoolStack --region eu-west-1 --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' --output text)
CLIENT_ID=$(aws cloudformation describe-stacks --stack-name CognitoPoolStack --region eu-west-1 --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' --output text)
DOMAIN=$(aws cloudformation describe-stacks --stack-name CognitoPoolStack --region eu-west-1 --query 'Stacks[0].Outputs[?OutputKey==`UserPoolDomain`].OutputValue' --output text)

echo "COGNITO_CONFIG={\"region\":\"eu-west-1\",\"userPoolId\":\"$POOL_ID\",\"clientId\":\"$CLIENT_ID\",\"userPoolDomain\":\"$DOMAIN\"}"
