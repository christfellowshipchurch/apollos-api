import { get, has, drop } from 'lodash';
import ApollosConfig from '@apollosproject/config';
import { parseGlobalId } from '@apollosproject/server-core';
import { parseRockKeyValuePairs, generateAppLinkFromUrl } from '../utils';

const { ROCK_MAPPINGS } = ApollosConfig;
const { CONTENT_CHANNEL_PATHNAMES } = ROCK_MAPPINGS;

const moreLinkJson = [
  {
    name: 'Our Church',
    links: [
      {
        name: 'Church Locations',
        icon: 'building',
        uri: 'https://christfellowship.church/locations',
        openInApp: true,
      },
      {
        name: 'About',
        icon: 'information',
        uri: 'https://christfellowship.church/about',
        openInApp: true,
      },
      {
        name: 'Shop Online',
        icon: 'arrow-back',
        uri: 'https://cf.church/shop',
        openInApp: false,
      },
    ],
  },
  {
    name: 'Contact',
    links: [
      {
        name: 'Contact Us',
        icon: 'text',
        uri: 'https://rock.gocf.org/contactus',
        openInApp: true,
      },
      {
        name: 'Connect Card',
        icon: 'text',
        uri: 'https://rock.gocf.org/connect',
        openInApp: true,
      },
      {
        name: 'Submit a Prayer Request',
        icon: 'pray',
        uri: 'https://rock.gocf.org/RequestPrayer',
        openInApp: true,
      },
    ],
  },
  {
    name: 'App Info',
    links: [
      {
        name: 'Terms & Conditions',
        icon: 'list',
        uri: 'https://christfellowship.church/terms-of-use',
        openInApp: true,
      },
      {
        name: 'Privacy Policy',
        icon: 'lock',
        uri: 'https://christfellowship.church/privacy-policy',
        openInApp: true,
      },
      {
        name: 'Send Feedback',
        icon: 'warning',
        uri: 'https://form.jotform.com/201343828801148',
        openInApp: true,
      },
    ],
  },
];

const profileLinkJson = [
  {
    name: 'Groups',
    icon: 'users',
    uri: 'https://rock.gocf.org/groups',
    openInApp: true,
    theme: {
      colors: {
        primary: '#00aeef',
      },
    },
  },
  {
    name: 'Serve',
    icon: 'handshake',
    uri: 'https://rock.christfellowship.church/dreamteam',
    openInApp: true,
    theme: {
      colors: {
        primary: '#d52158',
      },
    },
  },
  {
    name: 'Give',
    icon: 'envelope-open-dollar',
    uri: 'https://pushpay.com/g/christfellowship',
    openInApp: false,
    theme: {
      colors: {
        primary: '#1ec27f',
      },
    },
  },
];

const resolver = {
  AppLink: {
    theme: ({ theme }) => theme,
  },
  Query: {
    privacyPolicyUrl: () => 'https://christfellowship.church/privacy-policy',
    passwordResetUrl: () => 'https://christfellowship.church/login/forgot',
    moreLinks: () => moreLinkJson,
    profileLinks: () => profileLinkJson,
    websiteBanner: async (root, args, { dataSources }) => {
      const contentChannel = await dataSources.WebsiteNavigation.getFromId(54); // Digital Platform Website Pages
      const attributeValue = get(contentChannel, 'attributeValues.websiteBanner.value');
      const callsToAction = parseRockKeyValuePairs(attributeValue, 'call', 'action');

      return get(callsToAction, '[0]', null);
    },
    genderOptions: () => ['Male', 'Female'],
    inAppLink: (root, { url }, context) => generateAppLinkFromUrl(url, context),
    dannysContent: async (root, args, { dataSources: { ContentItem } }) => {
      const contentItem = await ContentItem.byContentChannelId(73).get();
      return contentItem;
    },
    nodeActions: async (root, { nodeId }, { dataSources }) => {
      const globalId = parseGlobalId(nodeId);

      if (!globalId.id) return [];

      const { ContentItem } = dataSources;
      const contentItem = await ContentItem.getFromId(globalId.id);

      if (!contentItem || !contentItem.attributeValues) return [];

      const { attributeValues } = contentItem;

      // Deprecated Content Channel Type
      const ctaValuePairs = parseRockKeyValuePairs(
        get(attributeValues, 'callsToAction.value', ''),
        'call',
        'action'
      );

      if (ctaValuePairs.length)
        return ctaValuePairs.map(({ call, action }) => ({
          title: call,
          action: 'OPEN_URL',
          relatedNode: {
            __typename: 'Url',
            url: action,
          },
        }));

      // Get Matrix Items
      const { MatrixItem } = dataSources;
      const matrixGuid = get(attributeValues, 'actions.value', '');
      const matrixItems = await MatrixItem.getItemsFromId(matrixGuid);

      return matrixItems.map(({ attributeValues: matrixItemAttributeValues }) => ({
        title: get(matrixItemAttributeValues, 'title.value', ''),
        action: 'OPEN_URL',
        relatedNode: {
          __typename: 'Url',
          url: get(matrixItemAttributeValues, 'url.value', ''),
        },
      }));
    },
    getNodeByPathname: async (
      root,
      { pathname },
      { dataSources: { PageBuilder, ContentItem } }
    ) => {
      const paths = pathname.split('/').filter((path) => path && path !== '');
      const firstPath = paths.find(() => true);

      switch (firstPath) {
        case 'groups':
          return null;
        case 'live':
          return null;
        default:
          let cleanedPathname = pathname;
          let contentChannelIds = CONTENT_CHANNEL_PATHNAMES.default;

          if (has(CONTENT_CHANNEL_PATHNAMES, firstPath) && paths.length > 1) {
            contentChannelIds = get(
              CONTENT_CHANNEL_PATHNAMES,
              firstPath,
              CONTENT_CHANNEL_PATHNAMES.default
            );
            cleanedPathname = drop(paths).join('/');
          }

          const contentItemId = await PageBuilder.getIdByPathname(
            cleanedPathname,
            contentChannelIds
          );

          if (contentItemId) {
            const contentItem = await ContentItem.getFromId(contentItemId);

            return {
              __typename: ContentItem.resolveType(contentItem),
              ...contentItem,
            };
          }
      }

      return null;
    },
  },
};

export default resolver;
