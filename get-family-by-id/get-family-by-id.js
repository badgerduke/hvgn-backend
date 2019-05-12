const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient({
  apiVersion: "2012-10-08",
  region: "us-east-1"
  /*     region: 'localhost',
    endpoint: "http://localhost:8000", */
});
//const docClient = ddb.DocumentClient();
const completeDateRegex = new RegExp(
  /^((\d{2})\s)?((JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s)?(\d{4})$/
);
const privatizeStartYear = process.env.PRIVATE_YEAR;

module.exports.handler = async function(event, context) {
  const bodyToReturn = { parents: [], children: [] };
  const familyId = event.pathParameters.id;
  const response = {};
  //response.headers = {'Access-Control-Allow-Origin': 'http://hvgn.s3-website-us-east-1.amazonaws.com'};
  response.headers = {'Access-Control-Allow-Origin': '*'};

  try {
    const familyData = await getItem(
      "Family",
      "FAMID, HUSB, WIFE",
      ddbKey("FAMID", familyId)
    );
    //console.log(`familyData = '${JSON.stringify(familyData)}'`)
    if (Object.entries(familyData).length === 0) {
      // We need it find an item, throw a 404.
      response.statusCode = 404;
      response.body = `Family with familyId of '${familyId}' was not found`;
    } else {
      bodyToReturn.familyId = familyId;
     // const father = extractValue(familyData.Item, "HUSB", "S");
     // const mother = extractValue(familyData.Item, "WIFE", "S");
      const father = familyData.Item.HUSB;
      const mother = familyData.Item.WIFE;
      let fatherPromise;
      let motherPromise;
      let childrenPromise;

      if (father) {
        fatherPromise = getItem(
          "Individual",
          "INDVID, FAMC, GIVEN, SURN, SUFF, SEX, BIRTDATE, BIRTPLAC, DEATDATE, DEATPLAC",
          ddbKey("INDVID", father)
        );
      }
      if (mother) {
        motherPromise = getItem(
          "Individual",
          "INDVID, FAMC, GIVEN, SURN, SUFF, SEX, BIRTDATE, BIRTPLAC, DEATDATE, DEATPLAC",
          ddbKey("INDVID", mother)
        );
      }
      childrenPromise = queryByGsi(
        "Children",
        "familyIdGSI",
        "FAMID = :a",
        { ":a": familyId },
        /* "_FREL, _MREL, CHILDID" */
      );

      const fatherData = await fatherPromise;
      const motherData = await motherPromise;
      const childrenData = await childrenPromise;

      bodyToReturn.parents.push(
        extractParentInformation(privatizeIndividual(fatherData.Item))
      );
      bodyToReturn.parents.push(
        extractParentInformation(privatizeIndividual(motherData.Item))
      );

      const childDataPromises = [];
      const childData = [];

      for (let i = 0; i < childrenData.Items.length; i++) {
        childDataPromises.push(
          getItem(
            "Individual",
            "INDVID, FAMS, GIVEN, SURN, SUFF, SEX, BIRTDATE, DEATDATE",
            ddbKey("INDVID", childrenData.Items[i].CHILDID)
          )
        );
      }

      for (let j = 0; j < childDataPromises.length; j++) {
        singleChildData = await childDataPromises[j];
        childData.push(privatizeIndividual(singleChildData.Item));
      }

      for (let k = 0; k < childData.length; k++) {
        const childId = childData[k].INDVID;
        const natural = extractNaturalFromChildren(childrenData.Items, childId);
        const fams = childData[k].FAMS;
        const familyIdToDisplay = getMinimumInArray(fams);
        bodyToReturn.children.push({
          childId: childId,
/*           surname: `${extractValue(childData[k], "SURN", "S")}`,
          givenName: `${extractValue(childData[k], "GIVEN", "S")}`,
          suffix: `${extractValue(childData[k], "SUFF", "S")}`,
          birthdate: extractValue(childData[k], "BIRTDATE", "S"),
          sex: extractValue(childData[k], "SEX", "S"), */
          surname: `${childData[k].SURN}`,
          givenName: `${childData[k].GIVEN}`,
          suffix: `${childData[k].SUFF}`,
          birthdate: childData[k].BIRTDATE,
          sex: childData[k].SEX,
          naturalOfFather: natural.father,
          naturalOfMother: natural.mother,
          familyIdToDisplay: familyIdToDisplay
        });
      }
    }
  } catch (err) {
    response.statusCode = 500;
    response.body = JSON.stringify(err);
  }

  if (!response.statusCode) {
    response.statusCode = 200;
    response.body = JSON.stringify(bodyToReturn);
  }

  return response;
};

/* let ddbKey = function(keyName, keyValue, keyType) {
  const keyObject = {};
  keyObject.keyName = keyName;
  keyObject.keyValue = keyValue;
  keyObject.keyType = keyType;
  return keyObject;
};
 */

let ddbKey = (partitionKeyName, partitionKeyValue, sortKeyName, sortKeyValue) => {
  const key = {};
  key[partitionKeyName] = partitionKeyValue;
  if (sortKeyName) {
    key[sortKeyName] = sortKeyValue;
  }
  return key;
}

/* let extractValue = function(object, property, type) {
  let value = "";

  if (object.hasOwnProperty(property)) {
    value = object[property][type];
  }

  return value;
}; */

/* let privatizeIndividual = individualItem => {
  console.log("individual item " + JSON.stringify(individualItem));
  let returnedItem = {};
  Object.assign(returnedItem, individualItem);

  let birthdate = extractValue(individualItem, "BIRTDATE", "S");
  if (completeDateRegex.test(birthdate)) {
    const birthdateRegexMatches = birthdate.match(completeDateRegex);
    console.log("birth year = " + birthdateRegexMatches[5]);
    let deathdate = extractValue(individualItem, "DEATDATE", "S");
    if (
      privatizeStartYear - 1 < Number(birthdateRegexMatches[5]) &&
      (deathdate == "" || !completeDateRegex.test(deathdate))
    ) {
      returnedItem.BIRTDATE.S = "Private";
      if (individualItem.BIRTPLAC) {
        returnedItem.BIRTPLAC.S = "Private";
      }
    }
  }
  return returnedItem;
}; */

let privatizeIndividual = individualItem => {
  console.log("individual item " + JSON.stringify(individualItem));
  let returnedItem = {};
  Object.assign(returnedItem, individualItem);

  let birthdate = individualItem.BIRTDATE;
  if (completeDateRegex.test(birthdate)) {
    const birthdateRegexMatches = birthdate.match(completeDateRegex);
    console.log("birth year = " + birthdateRegexMatches[5]);
    let deathdate = individualItem.DEATDATE;
    if (
      privatizeStartYear - 1 < Number(birthdateRegexMatches[5]) &&
      (deathdate == "" || !completeDateRegex.test(deathdate))
    ) {
      returnedItem.BIRTDATE = "Private";
      if (individualItem.BIRTPLAC) {
        returnedItem.BIRTPLAC.S = "Private";
      }
    }
  }
  return returnedItem;
};

/* let extractParentInformation = function(parentData) {
  const parent = {};
  parent.surname = extractValue(parentData, "SURN", "S");
  parent.givenName = extractValue(parentData, "GIVEN", "S");
  parent.suffix = extractValue(parentData, "SUFF", "S");
  parent.gender = extractValue(parentData, "SEX", "S");
  parent.birthdate = extractValue(parentData, "BIRTDATE", "S");
  parent.birthloc = extractValue(parentData, "BIRTPLAC", "S");
  parent.deathdate = extractValue(parentData, "DEATDATE", "S");
  parent.deathloc = extractValue(parentData, "DEATPLAC", "S");
  parent.familyOfOrigin = extractValue(parentData, "FAMC", "S");
  return parent;
}; */

let extractParentInformation = function(parentData) {
  const parent = {};
  parent.surname = parentData.SURN;
  parent.givenName = parentData.GIVEN;
  parent.suffix = parentData.SUFF;
  parent.gender = parentData.SEX;
  parent.birthdate = parentData.BIRTDATE;
  parent.birthloc = parentData.BIRTPLAC;
  parent.deathdate = parentData.DEATDATE;
  parent.deathloc = parentData.DEATPLAC;
  parent.familyOfOrigin = parentData.FAMC;
  return parent;
};

/* let extractNaturalFromChildren = function(childrenTableItems, childId) {
  let natural = {};

  for (let i = 0; i < childrenTableItems.length; i++) {
    if (childId === extractValue(childrenTableItems[i], "CHILDID", "S")) {
      natural.father = extractValue(childrenTableItems[i], "_FREL", "S");
      natural.mother = extractValue(childrenTableItems[i], "_MREL", "S");
    }
  }

  return natural;
}; */

let extractNaturalFromChildren = function(childrenTableItems, childId) {
  let natural = {};

  for (let i = 0; i < childrenTableItems.length; i++) {
    if (childId === childrenTableItems[i].CHILDID) {
      natural.father = childrenTableItems[i]._FREL;
      natural.mother = childrenTableItems[i]._MREL;
    }
  }

  return natural;
};

let getMinimumInArray = function(array) {
  if (array && array.length) {
    array.sort((a, b) => a - b);
    return JSON.stringify(Number(array[0]));
  }
  else {
    return null;
  }
}

/* let getItem = function(tableName, projectExpression, key, sortKey) {
  const request = {
    TableName: tableName,
    ConsistentRead: false,
    ProjectionExpression: projectExpression,
    Key: {}
  };

  request.Key[key.keyName] = {};
  request.Key[key.keyName][key.keyType] = key.keyValue;
  if (sortKey) {
    request.Key[sortKey.keyName] = {};
    request.Key[sortKey.keyName][sortKey.keyType] = sortKey.keyValue;
  }

  return new Promise(function(resolve, reject) {
    ddb.getItem(request, function(err, data) {
      if (err) {
        reject(err);
      } else {
        console.log(`getItem returned data`);
        resolve(data);
      }
    });
  });


}; */


let getItem = (tableName, projectExpression, ddbKey) => {
  return new Promise((resolve, reject) => {
    docClient.get({
      TableName: tableName,
      Key: ddbKey,
      ProjectionExpression: projectExpression,
      ConsistentRead: false
    }, 
    (err, data) => {
      if (err) {
        reject(err);
      } else {
        console.log(`getItem returned data`);
        resolve(data);
      };
    });
  });
};

/* let queryByGsi = function(
  tableName,
  gsiIndexName,
  keyExpression,
  expressionAttributeValues,
  projectionExpression
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
}; */

let queryByGsi = (
  tableName,
  gsiIndexName,
  keyExpression,
  expressionAttributeValues
) => {
  

  return new Promise(function(resolve, reject) {
    docClient.query({
      TableName: tableName,
      IndexName: gsiIndexName,
      KeyConditionExpression: keyExpression,
      ExpressionAttributeValues: expressionAttributeValues
    }, (err, data) => {
      if (err) {
        reject(err);
      } else {
        console.log(`query returned data`);
        resolve(data);
      }
    });
  });
};
