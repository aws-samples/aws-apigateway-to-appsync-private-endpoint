// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as appsync from "aws-cdk-lib/aws-appsync";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as path from "path";
import { Construct } from "constructs";
import { Stack, StackProps, Expiration, Duration  } from "aws-cdk-lib";
//
// This sample demonstrates how to use the AWS AppSync API with AWS DynamoDB.

export interface AppSyncSampleStackProps extends StackProps {

 }

export class AppSyncSampleStack extends Stack {
  public readonly appSyncDomain: string;
  public readonly demoTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: AppSyncSampleStackProps) {
    super(scope, id, props);

    const api = new appsync.GraphqlApi(this, "Api", {
      name: "demo",
      schema: appsync.SchemaFile.fromAsset(
        path.join(__dirname, "schema.graphql")
      ),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
          apiKeyConfig: {
            expires: Expiration.after(Duration.days(7)),
          }
        },
      },
      xrayEnabled: true,
      // create a private api
      visibility: appsync.Visibility.PRIVATE,
    });

    this.appSyncDomain = api.graphqlUrl.replace("/graphql", "")

    const demoTable = new dynamodb.Table(this, "DemoTable", {
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
    });
    const demoDS = api.addDynamoDbDataSource("demoDataSource", demoTable);

    // Resolver for the Query "getDemos" that scans the DynamoDb table and returns the entire list.
    // Resolver Mapping Template Reference:0
    demoDS.createResolver("QueryGetDemosResolver", {
      typeName: "Query",
      fieldName: "getDemos",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbScanTable(),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList(),
    });

    // Resolver for the Mutation "addDemo" that puts the item into the DynamoDb table.
    demoDS.createResolver("MutationAddDemoResolver", {
      typeName: "Mutation",
      fieldName: "addDemo",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbPutItem(
        appsync.PrimaryKey.partition("id").auto(),
        appsync.Values.projecting("input")
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });

    //To enable DynamoDB read consistency with the `MappingTemplate`:
    demoDS.createResolver("QueryGetDemosConsistentResolver", {
      typeName: "Query",
      fieldName: "getDemosConsistent",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbScanTable(true),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList(),
    });
  }
}
