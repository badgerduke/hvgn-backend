#! /bin/bash

npm install -g serverless
npm install serverless-offline serverless-pseudo-parameters serverless-domain-manager 

serverless deploy --stage $env --package $CODEBUILD_SRC_DIR/artifacts/$env -v