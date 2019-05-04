const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB({
    apiVersion: '2012-10-08',
    region: 'us-east-1',
/*     region: 'localhost',
    endpoint: "http://localhost:8000", */
});
const privatizeStartYear = process.env.PRIVATE_YEAR;

const completeDateRegex = new RegExp(/^((\d{2})\s)?((JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s)?(\d{4})$/);

module.exports.handler = async (event, context)  => {

    let bodyToReturn;
    const parentId = event.pathParameters.id;
    const response = {};
    console.log("parentId = " + parentId);
    try {
        const parentData = await getItem('Individual', "INDVID, FAMS, GIVEN, SURN, SUFF, SEX, BIRTDATE, BIRTPLAC, DEATDATE, DEATPLAC", 
            ddbKey('INDVID', parentId, "S"));
        console.log("parentData = " + JSON.stringify(parentData));    

        const famsSet = extractValue(parentData.Item, "FAMS", "SS");
        console.log("famsSet = " + Array.isArray(famsSet));

        const familyIdToDisplay = getMinimumInArray(famsSet);
        console.log("familyIdToDisplay = " + familyIdToDisplay);
        
        bodyToReturn = familyIdToDisplay;
    }

    catch (err) {
        response.statusCode = 500;
        response.body = JSON.stringify(err);
    }

    if (!response.statusCode) {
        response.statusCode = 200;
        response.body = JSON.stringify(bodyToReturn);
        response.headers = {'Access-Control-Allow-Origin': 'http://hvgn.s3-website-us-east-1.amazonaws.com'};
    }

    return response;
};

let getMinimumInArray = function(array) {
    array.sort((a, b) => a - b);
    return JSON.stringify(Number(array[0]));
}

let extractValue = function(object, property, type) {
    let value;

    if (object.hasOwnProperty(property)) {
        value = object[property][type];
    }

    return value;
};

let ddbKey = function(keyName, keyValue, keyType) {
    const keyObject = {};
    keyObject.keyName = keyName;
    keyObject.keyValue = keyValue;
    keyObject.keyType = keyType;
    return keyObject;
  };

let getItem = function (tableName, projectExpression, key, sortKey) {
    console.log("In getItem");
    const request = {
        "TableName": tableName,
        "ConsistentRead": false,
        "ProjectionExpression": projectExpression,
        "Key": {}
    }

    request.Key[key.keyName] = {};
    request.Key[key.keyName][key.keyType] = key.keyValue;
    if (sortKey) {
        request.Key[sortKey.keyName] = {};
        request.Key[sortKey.keyName][sortKey.keyType] = sortKey.keyValue;
    }
    
    return new Promise(function (resolve, reject) {
        ddb.getItem(request, function(err, data) {
            if (err) {
                reject(err);
            }
            else {
                console.log(`getItem returned data`);
                resolve(data);
            }
        });
    });
}