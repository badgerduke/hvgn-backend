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
const allowedOrigin = process.env.ALLOWED_ORIGIN;
const privatizeStartYear = process.env.PRIVATE_YEAR;
const hvgnTableName = process.env.HVGN_TABLE;

module.exports.handler = async function(event, context) {
  console.log(`event ${event}`);
  console.log(`role ${event.requestContext.authorizer.claims['cognito:role']}`);
  const bodyToReturn = { parents: [], children: [] };
  const familyId = event.pathParameters.id;
  const response = {};
  console.log("Allowed origin should be * = " + allowedOrigin);
  response.headers = { "Access-Control-Allow-Origin": allowedOrigin };

  try {
    const familyData = await getItemsByPK(
      hvgnTableName,
      `F${familyId}`
    );

     if (familyData.Items.length === 0) {
      // We need it find an item, throw a 404.
      response.statusCode = 404;
      response.body = `Family with familyId of 'F${familyId}' was not found`;
    } 
    else {
      const parentsData = transformParentData(familyData);
      transformAltPartnerData(familyData, parentsData);
      bodyToReturn.children = transformChildrenData(familyData)
      bodyToReturn.parents = parentsData;
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

const transformAltPartnerData = (familyData, parentsArray) => {

  familyData.Items.forEach(item => {
    if (item.TYPE === 'FA') {
      parentsArray.forEach(parent => {
        console.log(`PIN: ${item.PIN}, SK: ${parent.id}`);
        if (item.PIN === `P${parent.id}`) {
          parent.otherFamilies.push({
            familyId: item.FAM.substring(1, item.FAM.length),
            spouseName: item.NAME
          })
        }
      })
    }
  });
}

const transformParentData = (familyData, altPartnersData) => {
  const parentsArray = [];

  const parentsData = familyData.Items.filter( item => {
    return item.TYPE === 'FP';
  })

  if (parentsData.length === 2) {
    if (parentsData[0].SEX === 'M') {
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[0])));
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[1])));
    }
    else if (parentsData[1].SEX === 'M') {
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[1])));
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[0])));
    }
    else if (parentsData[0].SEX === 'F') {
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[0])));
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[1])));
    }
    else if (parentsData[1].SEX === 'F') {
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[1])));
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[0])));
    }
    else {
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[0])));
      parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[1])));
    }
  }
  else if (parentsData.length === 1) {
    parentsArray.push(extractParentInformation(privatizeIndividual(parentsData[0])));
  }
  return parentsArray;

};

let privatizeIndividual = individualItem => {
  let returnedItem = {};
  Object.assign(returnedItem, individualItem);

  let birthdate = individualItem.BDT;
  if (completeDateRegex.test(birthdate)) {
    const birthdateRegexMatches = birthdate.match(completeDateRegex);
    //console.log("birth year = " + birthdateRegexMatches[5]);
    let deathdate = individualItem.DDT;
    if (
      privatizeStartYear - 1 < Number(birthdateRegexMatches[5]) &&
      (deathdate == "" || !completeDateRegex.test(deathdate))
    ) {
      returnedItem.BDT = "Private";
      if (individualItem.BLC) {
        returnedItem.BLC = "Private";
      }
    }
  }
  return returnedItem;
};

let extractParentInformation = function(parentItem) {
  //{"BDT":"09 SEP 1938","GNM":"John Eugene","SEX":"M","FOO":"F5","VERS":1,"BLC":"Madison, Wisconsin.","USER":"me_eric","SK":"P2","FMS":["F1","F2","F772"],"PK":"F1","SUR":"Hamacher","TYPE":"FP"}
  const parent = {};
  parent.id = parentItem.SK.substring(1, parentItem.SK.length);
  parent.surname = parentItem.SUR;
  parent.givenName = parentItem.GNM;
  parent.suffix = parentItem.SUF;
  parent.gender = parentItem.SEX;
  parent.birthdate = parentItem.BDT;
  parent.birthLocation = parentItem.BLC;
  parent.deathdate = parentItem.DDT;
  parent.deathLocation = parentItem.DLC;
  if (parentItem.FOO) {
    parent.familyOfOrigin = parentItem.FOO.substring(1, parentItem.FOO.length);
  }
  parent.otherFamilies = [];
  return parent;
};

const transformChildrenData = (familyData) => {
  const children = [];

  familyData.Items.forEach(item => {
    if (item.TYPE === 'FC') {
      const fms = item.FMS;
      let familyIdToDisplay = null;
      if (fms) {
        familyIdToDisplay = getMinimumInArray(fms);
      }
      const privatizedChild = privatizeIndividual(item);
      children.push({
        id: privatizedChild.SK.substring(1, item.SK.length),
        surname: privatizedChild.SUR,
        givenName: privatizedChild.GNM,
        suffix: privatizedChild.SUF,
        birthdate: privatizedChild.BDT,
        gender: privatizedChild.SEX,
        naturalOfParents: privatizedChild.NAT,
        familyIdToDisplay: familyIdToDisplay
      })
    }
  });

  return children;
};

let getMinimumInArray = function(array) {
  if (array && array.length) {
    array.sort((a, b) => Number(a.substring(1, a.length)) - Number(b.substring(1, b.length)));
    return Number(array[0].substring(1, array[0].length));
  } else {
    return null;
  }
};

let getItemsByPK = (tableName, partitionKey) => {
  return new Promise((resolve, reject) => {
    try {
      docClient.query(
        {
          TableName: tableName,
          KeyConditionExpression: 'PK = :hkey',
          ExpressionAttributeValues: {
            ':hkey': partitionKey
          }
        },
        (err, data) => {
          if (err) {
            reject(err);
          } else {
            console.log(`getItem returned data`);
            resolve(JSON.parse(JSON.stringify(data)));
          }
        }
      );
    } catch (err) {
      reject(err);
    }
  });
};


