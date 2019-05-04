const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB({
  apiVersion: "2012-10-08",
  region: "us-east-1"
  /*     region: 'localhost',
    endpoint: "http://localhost:8000", */
});
const completeDateRegex = new RegExp(
  /^((\d{2})\s)?((JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s)?(\d{4})$/
);
const privatizeStartYear = process.env.PRIVATE_YEAR;

module.exports.handler = async function(event, context) {
  const bodyToReturn = { parents: [], children: [] };
  const familyId = event.pathParameters.id;
  const response = {};

  try {
    const familyData = await getItem(
      "Family",
      "FAMID, HUSB, WIFE",
      ddbKey("FAMID", familyId, "S")
    );
    //console.log(`familyData = '${JSON.stringify(familyData)}'`)
    if (Object.entries(familyData).length === 0) {
      // We need it find an item, throw a 404.
      response.statusCode = 404;
      response.body = `Family with familyId of '${familyId}' was not found`;
    } else {
      bodyToReturn.familyId = familyId;
      const father = extractValue(familyData.Item, "HUSB", "S");
      const mother = extractValue(familyData.Item, "WIFE", "S");
      let fatherPromise;
      let motherPromise;
      let childrenPromise;

      if (father) {
        fatherPromise = getItem(
          "Individual",
          "INDVID, GIVEN, SURN, SUFF, SEX, BIRTDATE, BIRTPLAC, DEATDATE, DEATPLAC",
          ddbKey("INDVID", father, "S")
        );
      }
      if (mother) {
        motherPromise = getItem(
          "Individual",
          "INDVID, GIVEN, SURN, SUFF, SEX, BIRTDATE, BIRTPLAC, DEATDATE, DEATPLAC",
          ddbKey("INDVID", mother, "S")
        );
      }
      childrenPromise = queryByGsi(
        "Children",
        "familyIdGSI",
        "FAMID = :a",
        { ":a": { S: familyId } },
        "_FREL, _MREL, CHILDID"
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
            "INDVID, GIVEN, SURN, SUFF, SEX, BIRTDATE, DEATDATE",
            ddbKey("INDVID", childrenData.Items[i].CHILDID.S, "S")
          )
        );
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

let ddbKey = function(keyName, keyValue, keyType) {
  const keyObject = {};
  keyObject.keyName = keyName;
  keyObject.keyValue = keyValue;
  keyObject.keyType = keyType;
  return keyObject;
};

let extractValue = function(object, property, type) {
  let value = "";

  if (object.hasOwnProperty(property)) {
    value = object[property][type];
  }

  return value;
};

let privatizeIndividual = individualItem => {
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
};

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
};

let getItem = function(tableName, projectExpression, key, sortKey) {
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
};

let queryByGsi = function(
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
};
