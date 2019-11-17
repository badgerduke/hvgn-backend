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
  response.headers = { "Access-Control-Allow-Origin": "*" };

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
      let fatherOtherFamiliesPromise;
      let motherOtherFamiliesPromise;
      let fatherData;
      let motherData;
      let fatherOtherFamiliesData;
      let motherOtherFamiliesData;
      let fatherOtherFamiliesProimise;
      let motherOtherFamiliesProimise;

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
      childrenPromise = queryByGsi("Children", "familyIdGSI", "FAMID = :a", {
        ":a": familyId
      });

      if (father) {
        fatherOtherFamiliesPromise = queryByGsi(
          "Family",
          "fatherIdGSI",
          "HUSB = :a",
          { ":a": father }
        );
      }

      if (mother) {
        motherOtherFamiliesPromise = queryByGsi(
          "Family",
          "motherIdGSI",
          "WIFE = :a",
          { ":a": mother }
        );
      }

      if (father) {
        fatherData = await fatherPromise;
      }
      if (mother) {
        motherData = await motherPromise;
      }
      const childrenData = await childrenPromise;

      if (father) {
        fatherOtherFamiliesData = await fatherOtherFamiliesPromise;
      }
      if (mother) {
        motherOtherFamiliesData = await motherOtherFamiliesPromise;
      }

      if (father) {
        fatherOtherFamiliesProimise = constructParentOtherFamiliesData(
          fatherOtherFamiliesData,
          "WIFE",
          familyId
        );
      }
      if (mother) {
        motherOtherFamiliesProimise = constructParentOtherFamiliesData(
          motherOtherFamiliesData,
          "HUSB",
          familyId
        );
      }
      const childrenDataPromise = constructChildrenData(childrenData);

      if (father) {
        fatherData.Item.otherFamilies = await fatherOtherFamiliesProimise;
      }
      if (mother) {
        motherData.Item.otherFamilies = await motherOtherFamiliesProimise;
      }

      bodyToReturn.children = await childrenDataPromise;

      if (father) {
        bodyToReturn.parents.push(
          extractParentInformation(privatizeIndividual(fatherData.Item))
        );
      }
      if (mother) {
        bodyToReturn.parents.push(
          extractParentInformation(privatizeIndividual(motherData.Item))
        );
      }
    }
  } catch (err) {
    console.log(err);
    response.statusCode = 500;
    response.body = JSON.stringify(err);
  }

  if (!response.statusCode) {
    response.statusCode = 200;
    response.body = JSON.stringify(bodyToReturn);
  }

  console.log(JSON.stringify(response));
  return response;
};

let ddbKey = (
  partitionKeyName,
  partitionKeyValue,
  sortKeyName,
  sortKeyValue
) => {
  const key = {};
  key[partitionKeyName] = partitionKeyValue;
  if (sortKeyName) {
    key[sortKeyName] = sortKeyValue;
  }
  return key;
};

let privatizeIndividual = individualItem => {
  let returnedItem = {};
  Object.assign(returnedItem, individualItem);

  let birthdate = individualItem.BIRTDATE;
  if (completeDateRegex.test(birthdate)) {
    const birthdateRegexMatches = birthdate.match(completeDateRegex);
    //console.log("birth year = " + birthdateRegexMatches[5]);
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

let extractParentInformation = function(parentData) {
  const parent = {};
  parent.id = parentData.INDVID;
  parent.surname = parentData.SURN;
  parent.givenName = parentData.GIVEN;
  parent.suffix = parentData.SUFF;
  parent.gender = parentData.SEX;
  parent.birthdate = parentData.BIRTDATE;
  parent.birthloc = parentData.BIRTPLAC;
  parent.deathdate = parentData.DEATDATE;
  parent.deathloc = parentData.DEATPLAC;
  parent.familyOfOrigin = parentData.FAMC;
  parent.otherFamilies = parentData.otherFamilies;
  return parent;
};

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
  } else {
    return null;
  }
};

let constructParentOtherFamiliesData = (
  parentOtherFamiliesData,
  otherTableAttribute,
  currentFamilyId
) => {
  return new Promise(async (resolve, reject) => {
    const parentOtherSpousesPromises = [];
    const parentOtherFamilies = [];
    let parentOtherSpouseData = [];

    try {
      for (let i = 0; i < parentOtherFamiliesData.Items.length; i++) {
        parentOtherSpousesPromises.push(
          getItem(
            "Individual",
            "INDVID, GIVEN, SURN, SUFF",
            ddbKey(
              "INDVID",
              parentOtherFamiliesData.Items[i][otherTableAttribute]
            )
          )
        );
      }

      for (let j = 0; j < parentOtherSpousesPromises.length; j++) {
        parentOtherSpouseData = await parentOtherSpousesPromises[j];
        const familyId = parentOtherFamiliesData.Items[j].FAMID;
        if (familyId !== currentFamilyId) {
          parentOtherFamilies.push({
            familyId: familyId,
            spouseName: `${parentOtherSpouseData.Item.GIVEN} ${parentOtherSpouseData.Item.SURN}`
          });
        }
      }
    } catch (err) {
      reject(err);
    }
    resolve(parentOtherFamilies);
  });
};

let constructChildrenData = childrenData => {
  return new Promise(async (resolve, reject) => {
    const childDataPromises = [];
    const childData = [];
    const children = [];

    try {
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
        let familyIdToDisplay = null;
        if (fams) {
          familyIdToDisplay = getMinimumInArray(fams.values);
        }
        children.push({
          childId: childId,
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
    } catch (err) {
      reject(err);
    }
    resolve(children);
  });
};

let getItem = (tableName, projectExpression, ddbKey) => {
  return new Promise((resolve, reject) => {
    try {
      docClient.get(
        {
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
          }
        }
      );
    } catch (err) {
      reject(err);
    }
  });
};

let queryByGsi = (
  tableName,
  gsiIndexName,
  keyExpression,
  expressionAttributeValues
) => {
  return new Promise(function(resolve, reject) {
    docClient.query(
      {
        TableName: tableName,
        IndexName: gsiIndexName,
        KeyConditionExpression: keyExpression,
        ExpressionAttributeValues: expressionAttributeValues
      },
      (err, data) => {
        if (err) {
          reject(err);
        } else {
          console.log(`query returned data`);
          resolve(data);
        }
      }
    );
  });
};
