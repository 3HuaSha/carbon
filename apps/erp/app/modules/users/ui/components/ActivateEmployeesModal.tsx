import { ValidatedForm } from "@carbon/form";
import {
  Button,
  HStack,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle
} from "@carbon/react";
import { Trans } from "@lingui/react/macro";
import { useFetcher } from "react-router";
import { UserSelect } from "~/components/Selectors";
import { activateEmployeesValidator } from "~/modules/users";
import { path } from "~/utils/path";

type ActivateEmployeesModalProps = {
  userIds: string[];
  isOpen: boolean;
  onClose: () => void;
};

const ActivateEmployeesModal = ({
  userIds,
  isOpen,
  onClose
}: ActivateEmployeesModalProps) => {
  const fetcher = useFetcher<{}>();
  const isSingleUser = userIds.length === 1;

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ModalContent>
        <ModalHeader>
          <ModalTitle>
            <Trans>Activate without invite</Trans>
          </ModalTitle>
        </ModalHeader>

        <ModalBody>
          <p className="mb-2">
            {isSingleUser ? (
              <Trans>
                Activate this employee immediately with no invite email? They
                become Active and can bind Telegram with this email.
              </Trans>
            ) : (
              <Trans>
                Activate these employees immediately with no invite email? They
                become Active and can bind Telegram with their email.
              </Trans>
            )}
          </p>
          <UserSelect value={userIds} readOnly isMulti />
        </ModalBody>
        <ModalFooter>
          <HStack>
            <Button variant="ghost" onClick={onClose}>
              <Trans>Cancel</Trans>
            </Button>
            <ValidatedForm
              method="post"
              action={path.to.activateEmployees}
              validator={activateEmployeesValidator}
              onSubmit={onClose}
              fetcher={fetcher}
            >
              {userIds.map((id, index) => (
                <input
                  key={id}
                  type="hidden"
                  name={`users[${index}]`}
                  value={id}
                />
              ))}
              <Button type="submit">
                <Trans>Activate</Trans>
              </Button>
            </ValidatedForm>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ActivateEmployeesModal;
