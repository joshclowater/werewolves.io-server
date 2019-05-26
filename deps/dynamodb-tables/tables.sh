# Local Games table
echo "Begin"

RESULT=$(aws dynamodb describe-table \
  --region us-east-1 \
  --endpoint-url $DYNAMODB_ENDPOINT \
  --table-name test_Games)
CODE=$?

echo "Code from describe-table test_Games" $CODE

if [ $CODE -eq 0 ]; then
  aws dynamodb delete-table \
    --region us-east-1 \
    --endpoint-url $DYNAMODB_ENDPOINT \
    --table-name test_Games
fi
aws dynamodb create-table \
  --region us-east-1 \
  --endpoint-url $DYNAMODB_ENDPOINT \
  --table-name test_Games \
  --key-schema AttributeName=name,KeyType=HASH \
  --attribute-definitions AttributeName=name,AttributeType=S \
  --provisioned-throughput ReadCapacityUnits=10,WriteCapacityUnits=10

echo "End"