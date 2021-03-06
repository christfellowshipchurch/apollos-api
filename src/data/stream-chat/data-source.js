import ApollosConfig from '@apollosproject/config';
import { RESTDataSource } from 'apollo-datasource-rest';
import { createGlobalId } from '@apollosproject/server-core';
import { StreamChat as StreamChatClient } from 'stream-chat';
import { chunk, get } from 'lodash';
import { Utils } from '@apollosproject/data-connector-rock';

const { STREAM } = ApollosConfig;
const { CHAT_SECRET, CHAT_API_KEY } = STREAM;

// Define singleton instance of StreamChatClient
let chatClient;

if (CHAT_SECRET && CHAT_API_KEY && !chatClient) {
  chatClient = new StreamChatClient(CHAT_API_KEY, CHAT_SECRET, { region: 'us-east-1' });
} else {
  console.warn(
    'You are using the Stream Chat dataSource without Stream credentials. To avoid issues, add Stream Chat credentials to your config.yml or remove the Stream Chat dataSource'
  );
}

const CREATE_USERS_LIMIT = 100;
const QUERY_MEMBERS_LIMIT = 100;
const ADD_MEMBERS_LIMIT = 100;
const REMOVE_MEMBERS_LIMIT = 100;
const PROMOTE_MODERATORS_LIMIT = 100;
const DEMOTE_MODERATORS_LIMIT = 100;

export default class StreamChat extends RESTDataSource {
  channelType = {
    LIVESTREAM: 'livestream',
    MESSAGING: 'messaging',
    GROUP: 'group',
  };

  getStreamUserId(id) {
    const globalId = createGlobalId(id, 'AuthenticatedUser');
    return globalId.split(':')[1];
  }

  generateUserToken = (userId) => {
    const streamUserId = this.getStreamUserId(userId);

    return chatClient.createToken(streamUserId);
  };

  currentUserIsLiveStreamModerator = async () => {
    const { Flag } = this.context.dataSources;
    const flagStatus = await Flag.currentUserCanUseFeature('LIVE_STREAM_CHAT_MODERATOR');

    return flagStatus === 'LIVE';
  };

  getChannel = ({ channelId, channelType = this.channelType.LIVESTREAM }) => {
    return chatClient.channel(channelType, channelId);
  };

  getStreamUser = (user) => {
    const imageId = get(user, 'photo.guid', '');
    let image = '';
    if (imageId) {
      image = Utils.createImageUrlFromGuid(imageId);
    }
    return {
      id: this.getStreamUserId(user.id),
      name: `${user.firstName} ${user.lastName}`,
      image,
    };
  };

  createStreamUsers = async ({ users }) => {
    await Promise.all(
      chunk(users, CREATE_USERS_LIMIT).map(async (chunkedUsers) => {
        await chatClient.updateUsers(chunkedUsers);
      })
    );
  };

  getChannel = async ({ channelId, channelType, options }) => {
    const channel = chatClient.channel(channelType, channelId, options);
    return channel.create();
  };

  getChannelMembers = async ({ channelId, channelType, filter = {} }) => {
    const channel = chatClient.channel(channelType, channelId);

    const channelMembers = [];
    let responseMembers;
    do {
      const channelMembersResponse = await channel.queryMembers(
        filter,
        {},
        { limit: QUERY_MEMBERS_LIMIT, offset: channelMembers.length }
      );
      responseMembers = channelMembersResponse.members;
      channelMembers.push(...responseMembers);
    } while (responseMembers.length === QUERY_MEMBERS_LIMIT);

    return channelMembers;
  };

  addMembers = async ({
    channelId,
    groupMembers,
    channelType = this.channelType.LIVESTREAM,
  }) => {
    const channel = chatClient.channel(channelType, channelId);
    const channelMembers = await this.getChannelMembers({ channelId, channelType });
    const channelMemberIds = channelMembers.map((channelMember) =>
      get(channelMember, 'user.id')
    );

    const newMembers = groupMembers.filter(
      (member) => !channelMemberIds.includes(member)
    );

    if (newMembers.length) {
      await Promise.all(
        chunk(newMembers, ADD_MEMBERS_LIMIT).map(async (chunkedMembers) => {
          await channel.addMembers(chunkedMembers);
        })
      );
    }
  };

  removeMembers = async ({
    channelId,
    groupMembers,
    channelType = this.channelType.LIVESTREAM,
  }) => {
    const channel = chatClient.channel(channelType, channelId);
    const channelMembers = await this.getChannelMembers({ channelId, channelType });
    const channelMemberIds = channelMembers.map((channelMember) =>
      get(channelMember, 'user.id')
    );

    const badMembers = channelMemberIds.filter(
      (channelMember) => !groupMembers.includes(channelMember)
    );

    if (badMembers.length) {
      await Promise.all(
        chunk(badMembers, REMOVE_MEMBERS_LIMIT).map(async (chunkedMembers) => {
          await channel.removeMembers(chunkedMembers);
        })
      );
    }
  };

  // Compare the group leaders to the channel moderators
  // Promote any member who is a group leader, but not a channel moderator
  // Demote any member who is a channel moderator, but not a group leader
  updateModerators = async ({
    channelId,
    groupLeaders,
    channelType = this.channelType.LIVESTREAM,
  }) => {
    const channel = chatClient.channel(channelType, channelId);
    const channelModerators = await this.getChannelMembers({
      channelId,
      channelType,
      filter: { is_moderator: true },
    });
    const channelModeratorIds = channelModerators.map((channelModerator) =>
      get(channelModerator, 'user.id')
    );

    // Promote any groupLeaders not in the channelModerators list
    const newModerators = groupLeaders.filter(
      (leader) => !channelModeratorIds.includes(leader)
    );

    if (newModerators.length) {
      await Promise.all(
        chunk(newModerators, PROMOTE_MODERATORS_LIMIT).map(async (chunkedModerators) => {
          await channel.addModerators(chunkedModerators);
        })
      );
    }

    // Demote any moderators not in the groupLeaders list
    const badModerators = channelModeratorIds.filter(
      (channelModerator) => !groupLeaders.includes(channelModerator)
    );

    if (badModerators.length) {
      await Promise.all(
        chunk(badModerators, DEMOTE_MODERATORS_LIMIT).map(async (chunkedModerators) => {
          await channel.demoteModerators(chunkedModerators);
        })
      );
    }
  };

  addModerator = async ({
    channelId,
    userId,
    channelType = this.channelType.LIVESTREAM,
  }) => {
    const streamUserId = this.getStreamUserId(userId);

    const channel = chatClient.channel(channelType, channelId);
    await channel.addModerators([streamUserId]);
  };

  removeModerator = async ({
    channelId,
    userId,
    channelType = this.channelType.LIVESTREAM,
  }) => {
    const streamUserId = this.getStreamUserId(userId);

    const channel = chatClient.channel(channelType, channelId);
    await channel.demoteModerators([streamUserId]);
  };
}
