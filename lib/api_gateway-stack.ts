// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Stack, StackProps } from "aws-cdk-lib";
import { Token } from "aws-cdk-lib";
import { Construct } from "constructs";
import { InterfaceVpcEndpoint, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import {
  NetworkLoadBalancer,
  Protocol,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import {
  ARecord,
  PrivateHostedZone,
  RecordTarget,
} from "aws-cdk-lib/aws-route53";
import { LoadBalancerTarget } from "aws-cdk-lib/aws-route53-targets";
import { IpTarget } from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import {
  ConnectionType,
  Integration,
  IntegrationType,
  RestApi,
  VpcLink,
} from "aws-cdk-lib/aws-apigateway";

export interface ApigwStackProps extends StackProps {
  appsyncDomain: string;
  appsyncApiGatewayPath: string;
  vpcCidr: string;
  noOfAZs: number;
}

export class ApigwStack extends Stack {
  constructor(scope: Construct, id: string, props: ApigwStackProps) {
    super(scope, id, props);

    const vpc = this.createVpc(
      props.vpcCidr,
      props.noOfAZs,
    );
    const vpcEndpoint = this.createAppSyncVPCEndpoint(vpc);
    const nlb = this.createNetworkLoadBalancerTargetingVpcEndpoint(
      vpc,
      vpcEndpoint,
      props.noOfAZs,
    );
    this.createAppSyncPrivateHostedZone(vpc, nlb);
    this.createRestApiWithAppSyncOrigin(
      props.appsyncDomain,
      props.appsyncApiGatewayPath,
      nlb
    );
  }

  private createVpc(vpcCidr: string, noOfAzs: number): Vpc {
    return new Vpc(this, "AppSyncApiGatewayVpc", {
      cidr: vpcCidr,
      maxAzs: noOfAzs,
      vpcName: "AppSyncApiGatewayVpc",
      subnetConfiguration: [
        {
          name: "gs-router-isolated",
          subnetType: SubnetType.PRIVATE_ISOLATED,
          cidrMask: 22,
        },
      ],
    });
  }

  private createAppSyncVPCEndpoint(vpc: Vpc): InterfaceVpcEndpoint {
    return vpc.addInterfaceEndpoint("AppSyncVpcEndpoint", {
      service: {
        name: "com.amazonaws.us-east-1.appsync-api",
        port: 443,
      },
      privateDnsEnabled: false,
      open: true,
      subnets: {
        subnetType: SubnetType.PRIVATE_ISOLATED,
      },
    });
  }

  private createNetworkLoadBalancerTargetingVpcEndpoint(
    vpc: Vpc,
    vpcEndpoint: InterfaceVpcEndpoint,
    noOfAZs: number
  ): NetworkLoadBalancer {
    const ipAddresses = this.getIpAddressesForVpcEndpoint(vpcEndpoint, noOfAZs);

    const nlb = new NetworkLoadBalancer(this, "AppSyncApiGatewayNLB", {
      vpc,
      internetFacing: false,
      loadBalancerName: "AppSyncApiGatewayNlb",
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_ISOLATED,
      },
    });

    const nlbListener = nlb.addListener("AppSyncApiGatewayNLBListener", {
      port: 443,
    });

    nlbListener.addTargets("AppSyncApiGatewayNLBTargetGroup", {
      port: 443,
      targets: ipAddresses.map((ip) => new IpTarget(ip)),
      healthCheck: {
        port: "443",
        protocol: Protocol.TCP,
      },
    });

    return nlb;
  }

  private createAppSyncPrivateHostedZone(
    vpc: Vpc,
    nlb: NetworkLoadBalancer
  ): PrivateHostedZone {
    const hostedZone = new PrivateHostedZone(
      this,
      "AppSyncApiGatewayPrivateHostedZone",
      {
        vpc,
        zoneName: "appsync-api.us-east-1.amazonaws.com",
      }
    );

    new ARecord(this, "AppSyncApiGatewayPrivateARecord", {
      zone: hostedZone,
      target: RecordTarget.fromAlias(new LoadBalancerTarget(nlb)),
    });

    return hostedZone;
  }

  private createRestApiWithAppSyncOrigin(
    appsyncDomain: string,
    path: string,
    nlb: NetworkLoadBalancer
  ): RestApi {
    const vpcLink = new VpcLink(this, "VpcLink", {
      targets: [nlb],
      vpcLinkName: "AppSyncApiGatewayPrivate",
    });

    const api = new RestApi(this, "AppSyncPrivateApiTest");

    const appsyncResource = api.root.addResource(path);
    appsyncResource.addMethod(
      "ANY",
      new Integration({
        uri: appsyncDomain,
        integrationHttpMethod: "POST",
        type: IntegrationType.HTTP_PROXY,
        options: {
          connectionType: ConnectionType.VPC_LINK,
          vpcLink: vpcLink,
        },
      })
    );

    return api;
  }

  private getIpAddressesForVpcEndpoint(
    vpcEndpoint: InterfaceVpcEndpoint,
    noOfAZs: number,
  ): string[] {
    return this.getIpsWithAWSCustomResource(
      vpcEndpoint.node.id,
      { NetworkInterfaceIds: vpcEndpoint.vpcEndpointNetworkInterfaceIds },
      noOfAZs // ToDo: make this dynamic
    );
  }

  private getIpsWithAWSCustomResource(
    resourceName: string,
    parameters: any,
    length: number
  ): string[] {
    const name = `GetIps-${resourceName}`;
    const outputPaths = Array.from(
      Array(length),
      (_, index) => `NetworkInterfaces.${index}.PrivateIpAddress`
    );
    const getIp = new AwsCustomResource(this, name, {
      onUpdate: {
        service: "EC2",
        action: "describeNetworkInterfaces",
        outputPaths,
        parameters,
        physicalResourceId: PhysicalResourceId.of(name),
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
      functionName: "AppSync-GS-Router-GetIpsFromNetworkInterfaces",
    });
    return outputPaths.map((path) =>
      Token.asString(getIp.getResponseField(path))
    );
  }
}
