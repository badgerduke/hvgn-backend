API_KEY_IDS=$(aws apigateway get-api-keys | jq -r --arg stage $1 '.items[] | select(.name | startswith("hvgn-backend-\($stage)")).id')
for API_KEY_ID in $API_KEY_IDS
do
    echo $API_KEY_ID
    aws apigateway delete-api-key --api-key $API_KEY_ID
done
#ANY_REM=$(aws apigateway get-api-keys | jq -r '.items[].name')
#echo "XXXXX" $ANY_REM "VVVV"