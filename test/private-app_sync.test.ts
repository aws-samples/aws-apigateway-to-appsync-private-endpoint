// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as PrivateAppSync from "../lib/app_sync_sample-stack";

// example test. To run these tests, uncomment this file along with the
// example resource in lib/private-app_sync-stack.ts
test("App Sync Stack Test", () => {
  const app = new cdk.App();
  // WHEN
  const stack = new PrivateAppSync.AppSyncSampleStack(app, "MyTestStack",{});
  // THEN
  const template = Template.fromStack(stack);

  template.hasResourceProperties("AWS::AppSync::GraphQLApi", {
    Visibility: "PRIVATE",
  });
});
