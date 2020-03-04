import tl = require('azure-pipelines-task-lib/task');
import shell = require("shelljs");
import path = require("path");
import fs = require('fs');
import { nexusV3 } from './nexusV3';
const nexus = new nexusV3();

async function run() {
    console.log(`Downloading artifact.`);
    try {
        // Are we debugging?
        const systemDebug = (/true/i).test((process.env.SYSTEM_DEBUG ? process.env.SYSTEM_DEBUG : "false"));
        // Get the task parameters
        const connection : string | undefined = tl.getInput("connection", false);

        if(!connection)
        {
            throw new Error("Invalid service endpoint.");
        }
        
        // Get the service connection details for communicating with Nexus
        const hostUri : URL | undefined = new URL(tl.getEndpointUrl(connection, false));  

        if(!hostUri)
        {
            throw new Error("A valid Nexus service connection Url is required!"); 
        }

        const auth: tl.EndpointAuthorization | undefined = tl.getEndpointAuthorization(connection, false);

        if(!auth) {
            throw new Error("A valid Nexus service connections is required!"); 
        }

        // Token,
        tl.debug(`Service endpoint auth.scheme '${auth.scheme}'.`);
        // Get the Nexus auth details
        const password : string | undefined = auth.parameters["password"];
        const username : string | undefined = auth.parameters["username"];
        // Get the SSL cert options
        const acceptUntrustedCerts = (/true/i).test((tl.getEndpointDataParameter(connection, "acceptUntrustedCerts", true) ? tl.getEndpointDataParameter(connection, "acceptUntrustedCerts", true) : "false"));
        tl.debug(`acceptUntrustedCerts is set to '${acceptUntrustedCerts}'.`);
        
        // Get the Nexus repository details
        const repository: string | undefined = tl.getInput("repository", true);
        const group: string | undefined = tl.getInput("group", true);
        const artifact: string | undefined = tl.getInput("artifact", true);
        const baseVersion: string | undefined = tl.getInput("baseVersion", true);
        const packaging: string | undefined = tl.getInput("packaging", true);
        const classifier: string | undefined = tl.getInput("classifier", false);
        let extension: string | undefined = tl.getInput("extension", false);
        const downloadPath: string | undefined = tl.getInput("downloadPath", false);

        // Do we have a extension
        if (!extension) {
            console.log('Extension has not been supplied, set default packaging extension.');
            extension = packaging;
        }

        // Verify artifact download path is set
        if(!downloadPath)
        {
            throw new Error("Invalid downloadPath.");
        }

        tl.debug(`Checking if downloadPath folder '${downloadPath}' exists.`);
        // Create the repo folder if doesnt exist
        if (!fs.existsSync(downloadPath)) {
            tl.debug('downloadPath folder does not exist therefore creating folder.');
            shell.mkdir(downloadPath);
        }        

        // Get the proxy configured for the DevOps Agent
        const agentProxy : tl.ProxyConfiguration | null = tl.getHttpProxyConfiguration();
        const httpProxy : string | undefined = process.env.HTTP_PROXY;
        const httpsProxy : string | undefined = process.env.HTTPS_PROXY;

        if(httpProxy)
        {
            tl.debug(`Environment Variable HTTP_PROXY set to '${httpProxy}'.`);
        }
        if(httpsProxy)
        {
            tl.debug(`Environment Variable HTTPS_PROXY set to '${httpsProxy}'.`);
        }

        // Is a Proxy set?
        if(agentProxy)
        {
            tl.debug(`Agent proxy is set to '${agentProxy.proxyUrl}'.`);
        }

        tl.debug(`HostUri set to '${hostUri}'`);
        // https://help.sonatype.com/repomanager3/rest-and-integration-api/search-api
        let requestPath : string = `/service/rest/v1/search/assets/download?sort=version&repository=${repository}&maven.groupId=${group}&maven.artifactId=${artifact}&maven.baseVersion=${baseVersion}&maven.extension=${extension}&maven.classifier`;

        // Do we have a classifier
        if (classifier) {
            console.log(`Using classifier ${classifier}.`);
            requestPath = `${requestPath}=${classifier}`
        }
        else
        {
            console.log('Classifier has not been supplied.');
        }

        // Handle root path
        if(hostUri.pathname !== "/")
        {
            requestPath = path.join(hostUri.pathname, requestPath);
        }

        // Build the final search uri
        const searchUri : URL = new URL(requestPath, hostUri);

        console.log(`Search for asset using '${searchUri}'.`);
        try {
            // need to refactor this logic to reduce duplication of code
            if (searchUri.protocol === "https:") {
                await nexus.execute_https(searchUri, username, password, acceptUntrustedCerts);
            }
            else
            {
                await nexus.execute_http(searchUri, username, password);
            }
            console.log(`Completed search for asset using '${searchUri}'.`);
        } catch (inner_err) {
            console.log(`Could not complete search for asset using '${searchUri}'.`);
            throw inner_err;
        }

    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
    console.log(`Downloading artifact completed.`);
}

run();