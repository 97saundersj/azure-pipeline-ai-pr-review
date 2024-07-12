import * as tl from "azure-pipelines-task-lib/task";
import { Agent } from 'https';
import fetch from 'node-fetch';

export async function addCommentToPR(fileName: string, comment: string, httpsAgent: Agent) {
  const body = {
    comments: [
      {
        parentCommentId: 0,
        content: comment,
        commentType: 1
      }
    ],
    status: 1,
    threadContext: {
      filePath: fileName,
    }
  }

  const stringifiedBody = JSON.stringify(body)

  const prUrl = `${tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI')}${tl.getVariable('SYSTEM.TEAMPROJECTID')}/_apis/git/repositories/${tl.getVariable('Build.Repository.Name')}/pullRequests/${tl.getVariable('System.PullRequest.PullRequestId')}/threads?api-version=5.1`

  try {
    const response = await fetch(prUrl, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${tl.getVariable('SYSTEM.ACCESSTOKEN')}`, 
        'Content-Type': 'application/json' 
      },
      body: stringifiedBody,
      agent: httpsAgent
    });

    const responseData = await response.json();
    console.log(`Response status: ${response.status}`);
    console.log(`Response data: ${JSON.stringify(responseData)}`);

    if (response.status !== 200) {
      throw new Error(`Failed to add comment to PR. Status: ${response.status}, Response: ${JSON.stringify(responseData)}`);
    }

    console.log(`New comment added successfully.`, stringifiedBody);
  } catch (error) {
    console.error('Error adding comment to PR:', error);
  }
}

export async function deleteExistingComments(httpsAgent: Agent) {
  console.log("Start deleting existing comments added by the previous Job ...");

  const threadsUrl = `${tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI')}${tl.getVariable('SYSTEM.TEAMPROJECTID')}/_apis/git/repositories/${tl.getVariable('Build.Repository.Name')}/pullRequests/${tl.getVariable('System.PullRequest.PullRequestId')}/threads?api-version=5.1`;
  const threadsResponse = await fetch(threadsUrl, {
    headers: { Authorization: `Bearer ${tl.getVariable('SYSTEM.ACCESSTOKEN')}` },
    agent: httpsAgent
  });

  const threads = await threadsResponse.json() as { value: [] };
  const threadsWithContext = threads.value.filter((thread: any) => thread.threadContext !== null);

  const collectionUri = tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI') as string;
  const collectionName = getCollectionName(collectionUri);
  const buildServiceName = `${tl.getVariable('SYSTEM.TEAMPROJECT')} Build Service (${collectionName})`;

  for (const thread of threadsWithContext as any[]) {
    const commentsUrl = `${tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI')}${tl.getVariable('SYSTEM.TEAMPROJECTID')}/_apis/git/repositories/${tl.getVariable('Build.Repository.Name')}/pullRequests/${tl.getVariable('System.PullRequest.PullRequestId')}/threads/${thread.id}/comments?api-version=5.1`;
    const commentsResponse = await fetch(commentsUrl, {
      headers: { Authorization: `Bearer ${tl.getVariable('SYSTEM.ACCESSTOKEN')}` },
      agent: httpsAgent
    });

    const comments = await commentsResponse.json() as { value: [] };

    for (const comment of comments.value.filter((comment: any) => comment.author.displayName === buildServiceName) as any[]) {
      const removeCommentUrl = `${tl.getVariable('SYSTEM.TEAMFOUNDATIONCOLLECTIONURI')}${tl.getVariable('SYSTEM.TEAMPROJECTID')}/_apis/git/repositories/${tl.getVariable('Build.Repository.Name')}/pullRequests/${tl.getVariable('System.PullRequest.PullRequestId')}/threads/${thread.id}/comments/${comment.id}?api-version=5.1`;

      await fetch(removeCommentUrl, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tl.getVariable('SYSTEM.ACCESSTOKEN')}` },
        agent: httpsAgent
      });
    }
  }

  console.log("Existing comments deleted.");
}

function getCollectionName(collectionUri: string) {
  const collectionUriWithoutProtocol = collectionUri!.replace('https://', '').replace('http://', '');

  if (collectionUriWithoutProtocol.includes('.visualstudio.')) {
    return collectionUriWithoutProtocol.split('.visualstudio.')[0];
  }
  else {
    return collectionUriWithoutProtocol.split('/')[1];
  }
}
