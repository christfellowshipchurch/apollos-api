import { gql } from 'apollo-server'
import { authSchema } from '@apollosproject/data-schema'

export default gql`
    ${authSchema}

    type IdentityResult {
        success: Boolean
        isExistingIdentity: Boolean
    }
    
    extend type Mutation {
        requestSmsLoginPin(phoneNumber: String!): IdentityResult
        authenticateCredentials(identity: String!, passcode: String!): Authentication
        createNewUserLogin(identity: String!, passcode: String!): Authentication
        updateUserLogin(identity: String!, passcode: String!): IdentityResult
        relateUserLoginToPerson(identity: String!, passcode: String!, input:[UpdateProfileInput]!): Authentication
        isValidIdentity(identity: String): IdentityResult
    }
`