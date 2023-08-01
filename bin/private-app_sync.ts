#!/usr/bin/env node

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ApigwStack } from "../lib/api_gateway-stack";
import { AppSyncSampleStack } from "../lib/app_sync_sample-stack";

const app = new cdk.App();

const appSyncStack = new AppSyncSampleStack(app, "AppSyncSampleStack", {
});

const apigwStack = new ApigwStack(app, "ApiGwStack", {
  appsyncDomain: appSyncStack.appSyncDomain,
  appsyncApiGatewayPath: "graphql",
  vpcCidr: "10.0.0.0/16",
  noOfAZs: 2
});

