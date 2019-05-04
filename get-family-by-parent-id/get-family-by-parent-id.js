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

    const bodyToReturn = {parents:[], children:[]};
    const parentId = event.pathParameters.parentid;
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

    const familyData = await getItem('Family', "FAMID, HUSB, WIFE", ddbKey('FAMID', familyIdToDisplay, "S"));
    console.log("familyData = " + JSON.stringify(familyData));
    const father = extractValue(familyData.Item, "HUSB", "S");
    const mother = extractValue(familyData.Item, "WIFE", "S");

    console.log("father id = " + father);
    console.log("mother id = " + mother);

    let fatherData;
    let motherData;
    let childrenData;
    const familyId = extractValue(familyData.Item, "FAMID", "S");
    if (father == parentId) {
        fatherData = parentData;
        const motherDataPromise = getItem('Individual', "INDVID, GIVEN, SURN, SUFF, SEX, BIRTDATE, BIRTPLAC, DEATDATE, DEATPLAC", 
            ddbKey('INDVID', mother, "S"));
        const childrenPromise = queryByGsi('Children', 'familyIdGSI', 'FAMID = :a', {':a': {'S' : familyIdToDisplay}}, "_FREL, _MREL, CHILDID");
        motherData = await motherDataPromise;
        childrenData = await childrenPromise;
    }
    else if (mother == parentId) {
        motherData = parentData;

        const fatherDataPromise = getItem('Individual', "INDVID, GIVEN, SURN, SUFF, SEX, BIRTDATE, BIRTPLAC, DEATDATE, DEATPLAC", 
            ddbKey('INDVID', father, "S"));
        const childrenPromise = queryByGsi('Children', 'familyIdGSI', 'FAMID = :a', {':a': {'S' : familyIdToDisplay}}, "_FREL, _MREL, CHILDID");
        fatherData = await fatherDataPromise;
        childrenData = await childrenPromise;
    }

    bodyToReturn.parents.push(extractParentInformation(privatizeIndividual(fatherData.Item)));
    bodyToReturn.parents.push(extractParentInformation(privatizeIndividual(motherData.Item)));

    const childDataPromises = [];
    const childData = [];

    for (let i = 0; i < childrenData.Items.length; i++) {
        childDataPromises.push(getItem('Individual', "INDVID, FAMS, GIVEN, SURN, SUFF, SEX, BIRTDATE, DEATDATE", ddbKey('INDVID', childrenData.Items[i].CHILDID.S, "S")));
    }

    for (let j = 0; j < childDataPromises.length; j++) {
        singleChildData = await childDataPromises[j];
        childData.push(privatizeIndividual(singleChildData.Item));
    }

    for (let k = 0; k < childData.length; k++) {
        const childId = extractValue(childData[k], "INDVID", "S");
        const natural = extractNaturalFromChildren(childrenData.Items, childId);
        const fams = extractValue(childData[k], "FAMS", "SS");
        let futureFamily = false;
        if (fams && fams.length) {
            futureFamily = true;
        }
        bodyToReturn.children.push({
            childId: childId,
            surname: `${extractValue(childData[k], "SURN", "S")}`,
            givenName: `${extractValue(childData[k], "GIVEN", "S")}`,
            suffix: `${extractValue(childData[k], "SUFF", "S")}`,
            birthdate: extractValue(childData[k], "BIRTDATE", "S"),
            sex: extractValue(childData[k], "SEX", "S"),
            naturalOfFather: natural.father,
            naturalOfMother: natural.mother,
            futureFamily: futureFamily
        });
        
    }

} catch (err) {
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

let privatizeIndividual = (individualItem) => {
    console.log('individual item ' + JSON.stringify(individualItem));
    let returnedItem = {};
    Object.assign(returnedItem, individualItem);

    let birthdate = extractValue(individualItem, "BIRTDATE", "S");
    if (completeDateRegex.test(birthdate)) {
        const birthdateRegexMatches = birthdate.match(completeDateRegex);
        console.log('birth year = ' + birthdateRegexMatches[5]);
        let deathdate = extractValue(individualItem, "DEATDATE", "S");
        if (privatizeStartYear - 1 < Number(birthdateRegexMatches[5]) && (deathdate == '' || !completeDateRegex.test(deathdate))) {
            returnedItem.BIRTDATE.S = "Private";
            if (individualItem.BIRTPLAC) {
                returnedItem.BIRTPLAC.S = "Private";
            }
        }
    }
    return returnedItem;
}

let extractParentInformation = function(parentData) {

    const parent = {};
    parent.surname = extractValue(parentData, "SURN", "S");
    parent.givenName = extractValue(parentData, "GIVEN", "S");
    parent.suffix = extractValue(parentData, "SUFF", "S");
    parent.gender = extractValue(parentData, "SEX", "S");
    parent.birthdate = extractValue(parentData, "BIRTDATE", "S");
    parent.birthloc = extractValue(parentData, "BIRTPLAC", "S");
    parent.deathdate = extractValue(parentData, "DEATDATE", "S");
    parent.deathloc = extractValue(parentData, "DEATPLAC", "S");
    return parent;
}



let extractValue = function(object, property, type) {
    let value;

    if (object.hasOwnProperty(property)) {
        value = object[property][type];
    }

    return value;
};

let extractNaturalFromChildren = function(childrenTableItems, childId) {
    let natural = {};

    for (let i = 0; i < childrenTableItems.length; i++) {
        if (childId === extractValue(childrenTableItems[i], "CHILDID", "S")) {
            natural.father = extractValue(childrenTableItems[i], "_FREL", "S");
            natural.mother = extractValue(childrenTableItems[i], "_MREL", "S");
        }
    }

    return natural;
}

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

let queryByGsi = function(
    tableName,
    gsiIndexName,
    keyExpression,
    expressionAttributeValues
  ) {
    const request = {
      TableName: tableName,
      IndexName: gsiIndexName,
      KeyConditionExpression: keyExpression,
      ExpressionAttributeValues: expressionAttributeValues
    };
  
    return new Promise(function(resolve, reject) {
      ddb.query(request, function(err, data) {
        if (err) {
          reject(err);
        } else {
          console.log(`query returned data`);
          resolve(data);
        }
      });
    });
  };